interface RenderOptions {
  hasMtl?: boolean;
}

export function createRenderHtml(modelUrl: string, ext: string, options?: RenderOptions): string {
  const isOBJ = ext === 'obj';
  const isFBX = ext === 'fbx';

  const loaderPath = isOBJ
    ? '/three/addons/loaders/OBJLoader.js'
    : isFBX
    ? '/three/addons/loaders/FBXLoader.js'
    : '/three/addons/loaders/GLTFLoader.js';

  const loaderName = isOBJ ? 'OBJLoader' : isFBX ? 'FBXLoader' : 'GLTFLoader';

  const extractScene = isOBJ || isFBX ? 'g' : 'g.scene';

  const mtlUrl = isOBJ && options?.hasMtl
    ? modelUrl.replace(/\.obj$/i, '.mtl')
    : null;

  const extractSceneBlock = `
const m=${extractScene};
if(!m){error('Loader returned null');return;}
const remove=[];
m.traverse(o=>{if(o.isMesh&&/Joints/i.test(o.name))remove.push(o);});
remove.forEach(x=>{if(x.parent)x.parent.remove(x);});
s.add(m);
const box=new THREE.Box3().setFromObject(m);
const sz=box.getSize(new THREE.Vector3());
if(sz.x===0&&sz.y===0&&sz.z===0){
c.position.set(0,0,5);
c.lookAt(0,0,0);
console.warn('Empty bounding box, using default camera');
}else{
const center=box.getCenter(new THREE.Vector3());
const dist=Math.max(sz.x,sz.y,sz.z)*2.5;
c.position.copy(center).add(new THREE.Vector3(dist*0.7,dist*0.5,dist));
c.lookAt(center);
}
await new Promise(r=>requestAnimationFrame(r));
r.render(s,c);
done();`;

  return `<!DOCTYPE html>
<html>
<head>
<style>
*{margin:0;box-sizing:border-box}
html,body{width:512px;height:512px;overflow:hidden;background:#f0f0f0}
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
const error=(msg)=>{const d=document.createElement('div');d.id='error';d.textContent=msg;document.body.appendChild(d);};
(async()=>{
try{
const THREE=await import('three');
${mtlUrl ? `const MTLLoader=(await import('/three/addons/loaders/MTLLoader.js')).MTLLoader;` : ''}
const Mod=await import('${loaderPath}');
const ${loaderName}=Mod.${loaderName};

const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
r.setSize(512,512);
r.setPixelRatio(2);
document.body.appendChild(r.domElement);

const s=new THREE.Scene();
s.background=new THREE.Color(0xf0f0f0);
const c=new THREE.PerspectiveCamera(45,1,0.01,1000);
s.add(new THREE.AmbientLight(0xffffff,0.6));
const dl=new THREE.DirectionalLight(0xffffff,1.2);
dl.position.set(5,10,7);
s.add(dl);
const fl=new THREE.DirectionalLight(0x8888ff,0.4);
fl.position.set(-5,0,-5);
s.add(fl);

${mtlUrl
  ? `new MTLLoader().setResourcePath('/model/').load('${mtlUrl}',mc=>{
mc.preload();
new ${loaderName}().setMaterials(mc).load('${modelUrl}',async g=>{${extractSceneBlock}},undefined,e=>{error(e.message||String(e));});
},undefined,e=>{error(e.message||String(e));});`
  : `new ${loaderName}().load('${modelUrl}',async g=>{${extractSceneBlock}},undefined,e=>{error(e.message||String(e));});`}
}catch(e){
error(e.message||String(e));
}
})();
</script>
</body>
</html>`;
}
