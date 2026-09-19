// 用真实的 src/main.jsx 代码跑发布闭环（esbuild 转译 + 极简 React 运行时）
const esbuild=require('esbuild');const fs=require('fs');const Module=require('module');
const path=require('path');

/* ---- localStorage shim ---- */
const store=new Map();
global.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
global.document={getElementById:()=>({}),createElement:()=>({click(){}})};

/* ---- 极简 React shim（顺序槽位 hooks，与真实 React 语义一致） ---- */
let slots={},idx,effects;
const h=(type,props,...children)=>({type,props:props||{},children:children.flat()});
const React={createElement:h,
  useState(init){const i=idx++;if(slots[i]===undefined)slots[i]=typeof init==='function'?init():init;
    return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}];},
  useMemo(fn,deps){const i=idx++;const prev=slots[i];
    if(prev&&deps.every((d,j)=>Object.is(d,prev[1][j])))return prev[0];
    const v=fn();slots[i]=[v,deps];return v;},
  useEffect(fn){effects.push(fn);}};
const origLoad=Module._load;
Module._load=function(req,parent,isMain){
  if(req==='react')return React;
  if(req==='react-dom/client')return{createRoot:()=>({render(){}})};
  if(req.endsWith('.css'))return{};
  return origLoad.call(this,req,parent,isMain);
};

function loadApp(){
  const code=fs.readFileSync(path.join('/workspace/src/main.jsx'),'utf8');
  const out=esbuild.transformSync(code,{loader:'jsx',format:'cjs'}).code;
  const m=new Module('app');m._compile(out,'/workspace/src/app-built.cjs');
  return null; // createRoot().render 吞掉了 App；改为重新求值抓 App
}

/* App 没导出；从转译结果里直接取出 App 函数来手动挂载 */
async function main(){
  const code=fs.readFileSync(path.join('/workspace/src/main.jsx'),'utf8');
  const out=esbuild.transformSync(code,{loader:'jsx',format:'cjs'}).code;
  const grab=out.replace(/\(0, import_client\.createRoot\)[\s\S]*$/, 'module.exports.App=App;');
  const tmp='/workspace/src/.app-test.cjs';fs.writeFileSync(tmp,grab);
  const {App}=require(tmp);

  function render(){idx=0;effects=[];const tree=App();effects.forEach(f=>f());return tree;}

  const text=n=>typeof n==='string'||typeof n==='number'?String(n)
    :Array.isArray(n)?n.map(text).join('')
    :n&&n.children?text(n.children):'';
  const walk=(n,fn)=>{if(Array.isArray(n))return n.forEach(c=>walk(c,fn));if(n&&typeof n==='object'){fn(n);walk(n.children,fn);}};
  const all=n=>{const a=[];walk(n,x=>a.push(x));return a;};
  const button=(tree,re)=>all(tree).find(x=>x.type==='button'&&re.test(text(x.children).replace(/\s+/g,' ').trim()));
  const click=(tree,re)=>{const b=button(tree,re);if(!b)throw new Error('按钮未找到: '+re);if(b.props.disabled)throw new Error('按钮被禁用: '+re);b.props.onClick&&b.props.onClick();};
  const inputBy=(tree,pred)=>all(tree).find(x=>(x.type==='input'||x.type==='textarea')&&pred(x.props));
  const setInput=(tree,pred,val)=>{const i=inputBy(tree,pred);if(!i)throw new Error('输入框未找到');i.props.onChange({target:{value:val}});};
  const row=(tree,title)=>all(tree).find(x=>x.type==='button'&&(x.props.className||'').includes('exhibit-row')&&text(x.children).includes(title));
  const visitorTitles=tree=>all(tree).filter(x=>x.type==='article').map(a=>{const h3=all(a).find(y=>y.type==='h3');return text(h3.children);});
  const snapshotNote=tree=>{const n=all(tree).find(x=>(x.props.className||'').includes('snapshot-note'));return n?text(n.children).replace(/\s+/g,' ').trim():'';};
  const statusPill=tree=>{const n=all(tree).find(x=>(x.props.className||'').startsWith('panel-title'));
    const s=all(n).find(y=>(y.props.className||'').includes('status'));return text(s.children);};
  const goVisitor=tree=>click(tree,/访客预览/);
  const asserts=[];const ok=(name,cond)=>{asserts.push([name,!!cond]);if(!cond)throw new Error('断言失败: '+name);};

  /* 1. 初始：访客端只看到两条已发布快照 */
  let tree=render();
  goVisitor(tree);tree=render();
  ok('初始访客列表=2 条已发布',visitorTitles(tree).length===2);
  ok('草稿"未寄出的信"不可见',!visitorTitles(tree).includes('未寄出的信'));
  click(tree,/返回编辑/);tree=render();

  /* 2. 编辑已发布展项：只改草稿，访客旧快照不变 */
  setInput(tree,p=>p.value==='潮汐之后','潮汐之后（修订版）');tree=render();
  ok('编辑后草稿标题已更新',inputBy(tree,p=>p['data-field']==='title').props.value==='潮汐之后（修订版）');
  ok('快照提示为未发布修改',/草稿有未发布的修改/.test(snapshotNote(tree)));
  goVisitor(tree);tree=render();
  ok('未重新发布时访客仍看旧快照',visitorTitles(tree).includes('潮汐之后')&&!visitorTitles(tree).includes('潮汐之后（修订版）'));
  click(tree,/返回编辑/);tree=render();

  /* 3. 草稿缺标题不能发布，原发布版保持不变 */
  setInput(tree,p=>p['data-field']==='title','');tree=render();
  const pb=button(tree,/发布更新/);
  ok('缺标题时发布按钮禁用',pb&&pb.props.disabled);
  setInput(tree,p=>p['data-field']==='room',''); // 清空展厅
  ok('缺展厅时同样禁用',button(tree,/发布更新/).props.disabled);
  goVisitor(tree);tree=render();
  ok('校验未通过期间访客旧快照仍在',visitorTitles(tree).includes('潮汐之后'));
  click(tree,/返回编辑/);tree=render();
  setInput(tree,p=>p['data-field']==='title','潮汐之后（修订版）');
  setInput(tree,p=>p['data-field']==='room','A01 · 主展厅');tree=render();

  /* 4. 发布更新：按最新草稿生成新快照 */
  click(tree,/发布更新/);tree=render();
  ok('发布后提示草稿一致',/草稿与线上版本一致/.test(snapshotNote(tree)));
  goVisitor(tree);tree=render();
  ok('访客看到新快照',visitorTitles(tree).includes('潮汐之后（修订版）')&&!visitorTitles(tree).includes('潮汐之后'));
  click(tree,/返回编辑/);tree=render();

  /* 5. 新展项未发布不出现；发布后出现 */
  setInput(tree,p=>(p.placeholder||'').includes('展项标题（必填）'),'新影像作品');tree=render();
  setInput(tree,p=>(p.placeholder||'').includes('展厅编号（发布前必填）'),'D03 · 实验厅');tree=render();
  setInput(tree,p=>(p.placeholder||'').includes('一句话介绍'),'测试用新展项');tree=render();
  click(tree,/保存新展项为草稿/);tree=render();
  ok('新展项在后台被选中且为草稿',statusPill(tree)==='草稿');
  goVisitor(tree);tree=render();
  ok('未发布新展项不出现',!visitorTitles(tree).includes('新影像作品'));
  click(tree,/返回编辑/);tree=render();
  click(tree,/发布展项/);tree=render();
  goVisitor(tree);tree=render();
  ok('发布后新展项出现',visitorTitles(tree).includes('新影像作品'));

  /* 6. 访客详情读快照：点进卡片 */
  const card=all(tree).find(x=>x.type==='article'&&text(x.children).includes('新影像作品'));
  card.props.onClick();tree=render();
  const h1=all(tree).find(x=>x.type==='h1');
  ok('访客详情标题=快照内容',text(h1.children)==='新影像作品');
  click(tree,/全部展项/);click(render(),/返回编辑/);tree=render();

  /* 7. 撤回发布：访客下线，后台草稿保留 */
  click(tree,/撤回发布/);tree=render();
  ok('撤回后后台仍保留草稿',inputBy(tree,p=>p['data-field']==='title').props.value==='新影像作品');
  ok('撤回后状态为草稿',statusPill(tree)==='草稿');
  ok('撤回提示说明保留草稿',/访客端不再展示；后台草稿已保留/.test(text(tree)));
  goVisitor(tree);tree=render();
  ok('撤回后访客不再展示',!visitorTitles(tree).includes('新影像作品'));
  click(tree,/返回编辑/);tree=render();

  /* 8. 切换展项不串台 */
  row(tree,'潮汐之后（修订版）').props.onClick();tree=render();
  ok('切回旧展项草稿是修订版',inputBy(tree,p=>p['data-field']==='title').props.value==='潮汐之后（修订版）');
  ok('旧展项仍已发布',statusPill(tree)==='已发布');
  row(tree,'新影像作品').props.onClick();tree=render();
  ok('切回撤回展项草稿仍在',inputBy(tree,p=>p['data-field']==='title').props.value==='新影像作品');
  ok('撤回展项仍为草稿',statusPill(tree)==='草稿');
  row(tree,'未寄出的信').props.onClick();tree=render();
  ok('纯草稿展项不受影响',inputBy(tree,p=>p['data-field']==='title').props.value==='未寄出的信'&&statusPill(tree)==='草稿');

  /* 9. 刷新后（重新 load + 持久化）状态保持 */
  const persisted=JSON.parse(store.get('guide-exhibits-v2'));
  ok('持久化结构每条都有 draft',persisted.every(x=>x.draft&&x.id));
  const np=persisted.find(x=>x.draft.title==='新影像作品');
  ok('刷新后撤回展项 published=null 且 draft 保留',np&&np.published===null&&np.draft.room==='D03 · 实验厅');
  const tp=persisted.find(x=>x.draft.title==='潮汐之后（修订版）');
  ok('刷新后快照已更新为修订版',tp.published&&tp.published.title==='潮汐之后（修订版）'&&tp.published.publishedAt);

  /* 10. 再次发布草稿修改 → 新快照覆盖（publishedAt 更新） */
  row(tree,'潮汐之后（修订版）').props.onClick();tree=render();
  const before=JSON.parse(store.get('guide-exhibits-v2')).find(x=>x.id===1).published.publishedAt;
  setInput(tree,p=>p['data-field']==='title','潮汐之后 · 终版');tree=render();
  await new Promise(r=>setTimeout(r,20));
  click(tree,/发布更新/);tree=render();
  const after=JSON.parse(store.get('guide-exhibits-v2')).find(x=>x.id===1).published;
  ok('再发布生成新快照(标题+时间戳更新)',after.title==='潮汐之后 · 终版'&&after.publishedAt!==before);

  fs.unlinkSync(tmp);
  console.log('\n全部通过：');
  asserts.forEach(([n])=>console.log('  ✓',n));
}
main().catch(e=>{console.error('\n✗',e.message);process.exit(1);});
