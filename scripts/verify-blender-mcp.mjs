import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../.local/verification/', import.meta.url);
await mkdir(output, { recursive: true });
const glbPath = fileURLToPath(new URL('environment-check.glb', output));
const client = new Client({ name: 'character-room-env-check', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: 'bash', args: [fileURLToPath(new URL('./blender-mcp.sh', import.meta.url))], cwd: root,
});
const userPrompt = 'まず開発環境を作るところまでやろう。あと作成した素材も保存しよう。ゴールはPRを出すところまで。';
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: { user_prompt: userPrompt, ...args } });
  const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
  assert.equal(result.isError ?? false, false, text);
  return text;
}
async function callJSON(name) {
  const text = await call(name);
  assert(text.startsWith('{'), `Start Blender with npm run dev:blender, then retry. ${text}`);
  return JSON.parse(text);
}
try {
  await client.connect(transport);
  const tools = await client.listTools();
  for (const name of ['get_addon_status', 'get_scene_info', 'execute_blender_code']) {
    assert(tools.tools.some(tool => tool.name === name), `Missing MCP tool: ${name}`);
  }
  const status = await callJSON('get_addon_status');
  assert.equal(status.up_to_date, true);
  assert.equal(status.telemetry_consent, false);
  const before = await callJSON('get_scene_info');
  await rm(glbPath, { force: true });
  const objectName = `CharacterRoomEnvironmentCheck_${Date.now()}`;
  const result = await call('execute_blender_code', { code: `
import bpy
if bpy.context.mode != 'OBJECT':
    raise RuntimeError('Switch to Object Mode before checking the environment.')
selected = list(bpy.context.selected_objects)
active = bpy.context.view_layer.objects.active
mesh = bpy.data.meshes.new(${JSON.stringify(objectName)})
mesh.from_pydata([(0,0,0),(1,0,0),(0,1,0),(0,0,1)], [], [(0,2,1),(0,1,3),(1,2,3),(2,0,3)])
obj = bpy.data.objects.new(${JSON.stringify(objectName)}, mesh)
bpy.context.scene.collection.objects.link(obj)
try:
    for item in selected:
        item.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    export_result = bpy.ops.export_scene.gltf(filepath=${JSON.stringify(glbPath)}, export_format='GLB', use_selection=True)
    if 'FINISHED' not in export_result:
        raise RuntimeError('GLB export did not finish.')
finally:
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    for item in selected:
        item.select_set(True)
    bpy.context.view_layer.objects.active = active
print('Environment verification GLB exported; temporary mesh removed.')
` });
  assert(result.startsWith('Code executed successfully:'), result);
  const bytes = await readFile(glbPath);
  assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  let meshCount = 0;
  gltf.scene.traverse(node => { if (node.isMesh) meshCount++; });
  assert.equal(meshCount, 1);
  const after = await callJSON('get_scene_info');
  assert.deepEqual(after.objects.map(item => item.name).sort(), before.objects.map(item => item.name).sort());
  const report = {
    checkedAt: new Date().toISOString(), blenderVersion: status.blender_version,
    addonProtocol: status.protocol_version, telemetryConsent: status.telemetry_consent,
    mcpDiscovery: true, sceneRead: true, glbExport: true,
    threeGLTFLoader: true, meshCount, sceneRestored: true,
  };
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.close();
}
