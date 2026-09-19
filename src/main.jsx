import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

/* 数据模型：每个展项有两份互不覆盖的内容
 *   draft     —— 后台编辑中的草稿，随时自动保存
 *   published —— 最近一次发布生成的快照；null 表示从未发布或已撤回
 * 访客端只读取 published，编辑只动 draft，发布时按最新 draft 克隆出新快照。 */
const STORE_KEY='guide-exhibits-v2';
const LEGACY_KEY='guide-exhibits';
const FIELDS=['title','room','type','desc','audio'];
const COLORS=['#e6b45d','#ef8f84','#83b9b1','#9ba7dc'];

const emptyDraft=()=>({title:'',room:'',type:'装置',desc:'',audio:''});
const pickDraft=d=>FIELDS.reduce((o,k)=>(o[k]=d[k]??'',o),{});
const nowLabel=()=>new Date().toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const takeSnapshot=(draft,version)=>({...pickDraft(draft),version,publishedAt:nowLabel()});

const seed=[
  {id:1,color:'#e6b45d',
    draft:{title:'潮汐之后',room:'A01 · 主展厅',type:'装置',desc:'一件记录海岸线变化的沉浸式影像装置。',audio:'https://example.com/audio.mp3'},
    published:{title:'潮汐之后',room:'A01 · 主展厅',type:'装置',desc:'一件记录海岸线变化的沉浸式影像装置。',audio:'https://example.com/audio.mp3',version:1,publishedAt:'2024/03/02 10:20'}},
  {id:2,color:'#ef8f84',
    draft:{title:'未寄出的信',room:'B02 · 纸上时间',type:'档案',desc:'来自三代人的手写信件与声音档案。',audio:''},
    published:null},
  {id:3,color:'#83b9b1',
    draft:{title:'柔软的边界',room:'C01 · 新媒介',type:'互动',desc:'观众的移动会改变墙面上的光影，每一次停留都不可复制。',audio:''},
    published:{title:'柔软的边界',room:'C01 · 新媒介',type:'互动',desc:'观众的移动会改变墙面上的光影。',audio:'',version:1,publishedAt:'2024/03/05 15:40'}},
];

/* 旧版（单份内容 + status）数据迁移到双轨模型，避免刷新后结构对不上 */
function migrateLegacy(raw){
  return raw.map(x=>{
    const draft={...emptyDraft(),...pickDraft(x)};
    return {id:x.id,color:x.color||COLORS[x.id%COLORS.length],draft,
      published:x.status==='已发布'?{...draft,version:1,publishedAt:'迁移自旧版数据'}:null};
  });
}
function load(){
  try{
    const raw=localStorage.getItem(STORE_KEY);
    if(raw)return JSON.parse(raw);
    const legacy=localStorage.getItem(LEGACY_KEY);
    if(legacy)return migrateLegacy(JSON.parse(legacy));
  }catch{}
  return seed;
}

const isLive=e=>!!e.published;
const isDirty=e=>!!e.published&&FIELDS.some(k=>e.draft[k]!==e.published[k]);
const statusOf=e=>!e.published?{label:'草稿',cls:'draft'}
  :isDirty(e)?{label:'未发布修改',cls:'dirty'}
  :{label:'已发布',cls:'live'};

function App(){
  const [exhibits,setExhibits]=useState(load);
  const [selected,setSelected]=useState(1);
  const [view,setView]=useState('edit');
  const [filter,setFilter]=useState('全部');
  const [form,setForm]=useState({title:'',room:'',desc:''});
  const [errors,setErrors]=useState({});
  const [notice,setNotice]=useState(null);

  useEffect(()=>localStorage.setItem(STORE_KEY,JSON.stringify(exhibits)),[exhibits]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(null),2800);return ()=>clearTimeout(t);},[notice]);
  /* 切换展项时清掉发布校验提示，保证各展项草稿状态不串台 */
  useEffect(()=>setErrors({}),[selected]);
  const toast=text=>setNotice({text,id:Date.now()});

  const visible=useMemo(()=>filter==='全部'?exhibits
    :filter==='已发布'?exhibits.filter(isLive)
    :exhibits.filter(e=>!isLive(e)),[exhibits,filter]);
  const current=exhibits.find(x=>x.id===selected)||exhibits[0];

  const patch=(k,v)=>{
    setExhibits(exhibits.map(x=>x.id===current.id?{...x,draft:{...x.draft,[k]:v}}:x));
    setErrors(e=>({...e,[k]:false}));
  };
  const add=()=>{
    if(!form.title.trim()){toast('请先填写展项标题');return;}
    const id=exhibits.reduce((m,x)=>Math.max(m,x.id),0)+1;
    const item={id,color:COLORS[id%COLORS.length],
      draft:{...emptyDraft(),title:form.title.trim(),room:form.room.trim(),desc:form.desc.trim()},
      published:null};
    setExhibits([...exhibits,item]);
    setSelected(id);
    setForm({title:'',room:'',desc:''});
    toast('已保存为草稿，发布前访客不可见');
  };
  const publish=()=>{
    const bad={title:!current.draft.title.trim(),room:!current.draft.room.trim()};
    if(bad.title||bad.room){
      setErrors(bad);
      toast('草稿缺少标题或展厅，不能发布；原发布版保持不变');
      return;
    }
    setExhibits(exhibits.map(x=>x.id===current.id
      ?{...x,published:takeSnapshot(x.draft,(x.published?.version||0)+1)}
      :x));
    toast(current.published?'已按最新草稿生成新快照，访客预览已更新':'已发布，访客预览已更新');
  };
  const withdraw=()=>{
    setExhibits(exhibits.map(x=>x.id===current.id?{...x,published:null}:x));
    toast('已撤回发布，访客端不再展示，后台草稿仍保留');
  };
  const exportData=()=>{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(exhibits,null,2)],{type:'application/json'}));
    a.download='exhibition-guide.json';a.click();
    toast('已导出展项数据');
  };

  const toastEl=notice&&<div className="toast">{notice.text}</div>;

  const visitorList=()=>(
    <div className="visitor">
      <header>
        <div className="brand"><span className="mark">M</span><span>潮汐美术馆</span></div>
        <button className="ghost" onClick={()=>setView('edit')}>返回编辑</button>
      </header>
      <main className="visitor-main">
        <span className="eyebrow">VISITOR GUIDE / 2024</span>
        <h1>沿着作品，<em>走进</em>另一种时间。</h1>
        <p className="lead">当你靠近一件作品，它的故事就开始流动。选择一个展项开始探索。</p>
        <div className="visitor-grid">
          {exhibits.filter(isLive).map(x=>{const s=x.published;return(
            <article className="visitor-card" key={x.id} onClick={()=>{setSelected(x.id);setView('detail')}}>
              <div className="art" style={{background:x.color}}><span>{String(x.id).padStart(2,'0')}</span><i>↗</i></div>
              <div className="card-meta"><small>{s.room}</small><h3>{s.title}</h3><p>{s.desc}</p></div>
            </article>)}
          )}
        </div>
      </main>
      {toastEl}
    </div>
  );

  if(view==='visitor')return visitorList();
  if(view==='detail'){
    const s=current?.published;
    /* 快照已被撤回或不存在时，访客无法落到详情页 */
    if(!s)return visitorList();
    return (
      <div className="visitor">
        <header>
          <div className="brand"><span className="mark">M</span><span>潮汐美术馆 · 导览</span></div>
          <button className="ghost" onClick={()=>setView('visitor')}>← 全部展项</button>
        </header>
        <main className="detail">
          <div className="detail-art" style={{background:current.color}}><span>{String(current.id).padStart(2,'0')}</span></div>
          <div className="detail-copy">
            <span className="eyebrow">{s.room} / {s.type}</span>
            <h1>{s.title}</h1>
            <p>{s.desc}</p>
            {s.audio&&<button className="audio" onClick={()=>toast('正在播放导览音频…')}>▶ 播放语音导览</button>}
            <div className="qr"><div className="qr-box">▦</div><div><strong>分享这个展项</strong><small>扫描二维码，在手机上继续阅读</small></div></div>
          </div>
        </main>
        {toastEl}
      </div>
    );
  }

  const st=statusOf(current);
  const dirty=isDirty(current);
  const publishLabel=!current.published?'发布':dirty?'发布更新':'已是最新';

  return (
    <div className="app">
      <aside>
        <div className="brand"><span className="mark">M</span><span>展览工作台</span></div>
        <div className="side-label">当前项目</div>
        <div className="project"><span className="project-dot"></span><div><strong>潮汐之后</strong><small>2024 春季展</small></div><span>⌄</span></div>
        <nav>
          <button className="active">▧ <span>展项内容</span><b>{exhibits.length}</b></button>
          <button>⌁ <span>展厅动线</span></button>
          <button>◉ <span>二维码</span></button>
        </nav>
        <div className="side-foot"><button>⚙ 设置</button><small>草稿已自动保存 · 刚刚</small></div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div><span className="eyebrow">EXHIBITION BUILDER</span><h1>展项内容</h1></div>
          <div className="top-actions">
            <button className="secondary" onClick={exportData}>↓ 导出 JSON</button>
            <button className="secondary" onClick={()=>setView('visitor')}>◉ 访客预览</button>
            {current.published&&<button className="secondary danger" onClick={withdraw}>撤回发布</button>}
            <button className="primary" disabled={!!current.published&&!dirty} onClick={publish}>{publishLabel} <span>↗</span></button>
          </div>
        </header>
        <div className="content">
          <section className="list-pane">
            <div className="list-head">
              <div><h2>全部展项</h2><span>{exhibits.length} 个展项</span></div>
              <button className="add-btn" onClick={()=>document.querySelector('.new-form').scrollIntoView({behavior:'smooth'})}>＋ 添加展项</button>
            </div>
            <div className="filters">{['全部','已发布','草稿'].map(x=><button className={filter===x?'selected':''} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</div>
            <div className="exhibit-list">
              {visible.map(x=>{const sx=statusOf(x);return(
                <button className={'exhibit-row '+(selected===x.id?'chosen':'')} key={x.id} onClick={()=>setSelected(x.id)}>
                  <span className="thumb" style={{background:x.color}}>{String(x.id).padStart(2,'0')}</span>
                  <span className="row-copy"><strong>{x.draft.title||'未命名展项'}</strong><small>{x.draft.room||'未分配展厅'} · {x.draft.type}</small></span>
                  <span className={'status '+sx.cls}>{sx.label}</span>
                  <span className="chev">›</span>
                </button>)})}
            </div>
          </section>
          <section className="form-panel">
            <div className="panel-title">
              <div>
                <span className="eyebrow">EDIT EXHIBIT</span>
                <h2>编辑草稿</h2>
                {current.published
                  ?<small className="published-meta">最近发布 v{current.published.version} · {current.published.publishedAt}</small>
                  :<small className="published-meta">尚未发布</small>}
              </div>
              <span className={'status '+st.cls}>{st.label}</span>
            </div>
            {current&&<>
              <div className={dirty?'snapshot-note dirty':'snapshot-note'}>
                {!current.published?'尚未发布，访客端不可见；补全标题与展厅后即可发布。'
                  :dirty?`草稿有未发布修改，访客仍在查看 v${current.published.version} 快照；发布后才会替换。`
                  :`草稿与已发布版本 v${current.published.version} 一致，访客看到的就是当前内容。`}
              </div>
              <div className="editor">
                <label>展项标题
                  <input className={errors.title?'invalid':''} value={current.draft.title} onChange={e=>patch('title',e.target.value)}/>
                  {errors.title&&<small className="field-error">发布前必须填写标题</small>}
                </label>
                <div className="two">
                  <label>所在展厅
                    <input className={errors.room?'invalid':''} value={current.draft.room} placeholder="如 A01 · 主展厅" onChange={e=>patch('room',e.target.value)}/>
                    {errors.room&&<small className="field-error">发布前必须填写展厅</small>}
                  </label>
                  <label>内容类型<select value={current.draft.type} onChange={e=>patch('type',e.target.value)}><option>装置</option><option>档案</option><option>互动</option><option>绘画</option></select></label>
                </div>
                <label>展项介绍<textarea rows="5" value={current.draft.desc} onChange={e=>patch('desc',e.target.value)}/></label>
                <label>语音导览 URL<input value={current.draft.audio} placeholder="https://…" onChange={e=>patch('audio',e.target.value)}/><small className="hint">访客扫描二维码后可播放</small></label>
                <div className="preview-block">
                  <div className="preview-heading"><span>二维码预览</span><button onClick={()=>toast('二维码链接已复制')}>复制链接</button></div>
                  <div className="qr-preview"><div className="qr-box big">▦</div><div><strong>展项-{String(current.id).padStart(3,'0')}</strong><small>/guide/{current.id}</small></div></div>
                </div>
              </div>
            </>}
            <div className="new-form">
              <div className="panel-title"><div><span className="eyebrow">NEW ENTRY</span><h2>快速添加展项</h2></div></div>
              <div className="two">
                <input placeholder="展项标题" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
                <input placeholder="展厅编号（发布前必填）" value={form.room} onChange={e=>setForm({...form,room:e.target.value})}/>
              </div>
              <textarea placeholder="一句话介绍…" rows="2" value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})}/>
              <button className="primary full" onClick={add}>保存新展项（草稿）</button>
            </div>
          </section>
        </div>
      </main>
      {toastEl}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App/>);
