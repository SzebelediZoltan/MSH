export interface ConvertOptions {
  hasMtl?: boolean;
  mtlFileName?: string | null;
}

export function createConvertHtml(modelUrl: string, ext: string, options?: ConvertOptions): string {
  const isOBJ = ext === 'obj';
  const isFBX = ext === 'fbx';

  const loaderPath = isFBX
    ? '/three/addons/loaders/FBXLoader.js'
    : isOBJ
    ? '/three/addons/loaders/OBJLoader.js'
    : '/three/addons/loaders/GLTFLoader.js';
  const loaderName = isFBX ? 'FBXLoader' : isOBJ ? 'OBJLoader' : 'GLTFLoader';

  const extractObject = isOBJ || isFBX ? 'object' : 'object.scene';
  const resourcePath = isFBX ? ".setResourcePath('/model/')" : '';

  const mtlUrl =
    isOBJ && options?.hasMtl && options?.mtlFileName
      ? `/model/${options.mtlFileName}`
      : null;

  const mtlLoaderImport = mtlUrl
    ? `const {MTLLoader}=await import('/three/addons/loaders/MTLLoader.js');`
    : '';

  const finishBlock = `
let exporter;
async function finish(object){
  const model=${extractObject};
  if(!model){error('Loader returned null');return;}
  const remove=[];
  model.traverse(o=>{if(o.isMesh&&/Joints/i.test(o.name))remove.push(o);});
  remove.forEach(m=>{if(m.parent)m.parent.remove(m);});
  try{
    const result=await exporter.parseAsync(model,{binary:true});
    const bytes=new Uint8Array(result);
    let bin='';
    const CHUNK=0x8000;
    for(let i=0;i<bytes.length;i+=CHUNK){bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+CHUNK));}
    window.__convertResult=btoa(bin);
    done();
  }catch(e){error((e&&e.message)||e);}
}`;

  const loadBlock = mtlUrl
    ? `new MTLLoader().setResourcePath('/model/').load('${mtlUrl}',mc=>{
mc.preload();
new Loader().setMaterials(mc).load('${modelUrl}',object=>{finish(object);},undefined,e=>{error((e&&e.message)||e);});
},undefined,e=>{error((e&&e.message)||e);});`
    : `new Loader()${resourcePath}.load('${modelUrl}',object=>{finish(object);},undefined,e=>{error((e&&e.message)||e);});`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
*{margin:0;overflow:hidden}
</style>
</head>
<body>
<script type="importmap">
{
"imports":{
"three":"/three/three.module.js",
"three/addons/":"/three/addons/"
}
}
</script>
<script>
const done=()=>{const d=document.createElement('div');d.id='done';document.body.appendChild(d);};
const error=(msg)=>{const d=document.createElement('div');d.id='error';d.textContent=String(msg).slice(0,500);document.body.appendChild(d);};
${finishBlock}
(async()=>{
try{
const THREE=await import('three');
const Mod=await import('${loaderPath}');
const Loader=Mod.${loaderName};
${mtlLoaderImport}
const {GLTFExporter}=await import('/three/addons/exporters/GLTFExporter.js');

const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(1,1);

const scene=new THREE.Scene();
exporter=new GLTFExporter(renderer);

${loadBlock}
}catch(e){
error((e&&e.message)||e);
}
})();
</script>
</body>
</html>`;
}
