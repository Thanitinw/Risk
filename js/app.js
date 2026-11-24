(function(){
  "use strict";

  /* ---------------- DATA ---------------- */
  var LEVEL_META = {
    "สูงมาก": {cls:"crit", css:"l-crit"},
    "สูง": {cls:"high", css:"l-high"},
    "ปานกลาง": {cls:"watch", css:"l-mid"},
    "ต่ำ": {cls:"good", css:"l-low"}
  };

  var SUBS = PRC.SUBS;

  var FILTER_COMPANIES = PRC.FILTER_COMPANIES;
  var activeFilter = []; // selected companies on risk pages ([] = ทั้งหมด), multi-select
  var selectedCompany = null;
  var collapsedParents = {};
  var overviewView = "table";
  /* KPI register outline (Excel-style grouping): 1 = objective only, 2 = + Corporate KPI, 3 = all */
  var cmLevel = 1, cmObj = {}, cmDom = {}; /* 1 objective · 2 + Corporate KPI · 3 + Company KPI · 4 + company columns */
  var regFilter = {co:"ALL", dom:"ALL", lvl:"ALL", tier:"ALL"}; // KPI register filters
  /* Holding focus tiers — who drives each Strategic Objective and how often the holding (PCC) follows it */
  var TIERS = PRC.TIERS;
  var OBJ_TIER = PRC.OBJ_TIER;
  var OBJ_TIER_NOTE = PRC.OBJ_TIER_NOTE;
  // KRI inherits the Tier of its risk's primary objective (first in objs)
  function tierWhy(r, short){ var c=(r.objs||[])[0], t=OBJ_TIER[c]; if(!t) return ''; return '<span class="kri-tier">'+tierBadge(c)+'<b class="mono">'+c+'</b>'+(short?'':' '+esc(OBJ_TIER_NOTE[c]||TIERS[t].def))+'</span>'; }
  function tierBadge(code){ var t=OBJ_TIER[code]; if(!t) return '';
    return '<span class="tier t'+t+'" title="'+escAttr('Tier '+t+' · '+TIERS[t].name+' — '+TIERS[t].def+(OBJ_TIER_NOTE[code]?' · '+OBJ_TIER_NOTE[code]:''))+'">T'+t+'</span>'; }
  var selectedKpi = null;
  var selectedRisk = null;
  var profileView = "list"; var riskObjs = [], riskQ = "", kriView = "now", audF = "all", audLimit = 60; // Risk Profile: "objective" (grouped by Strategic Objective) | "list" (register table)
  var regCell = null; // heat-map cell filter for the register, e.g. "3-4"
  var riskLvl = [];    // Risk Profile level filter ([] = ทั้งหมด), multi-select
  var kriSt = [];      // KRI Monitoring status filter ([] = ทั้งหมด), multi-select
  function inSel(arr, v){ return !arr.length || arr.indexOf(v)!==-1; }
  function toggleSel(arr, v){ if(v==="ALL") return []; var i=arr.indexOf(v); return i===-1 ? arr.concat([v]) : arr.slice(0,i).concat(arr.slice(i+1)); }

  function kri(name,current,appetite,tolerance,status){ return {name:name,current:current,appetite:appetite,tolerance:tolerance,status:status}; }

  var RISKS = PRC.RISKS;

  var BSC_PERSPECTIVES = PRC.BSC_PERSPECTIVES;

  var KPI_LIST = PRC.KPI_LIST;

  /* ---------------- HELPERS ---------------- */
  function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c]; }); }
  function subName(id){ var s=SUBS.filter(function(x){return x.id===id;})[0]; return s?s.id:id; }
  function filteredRisks(){
    var base = RISKS.filter(function(r){ return inSel(activeFilter, r.sub); });
    if(typeof currentUser!=="undefined" && currentUser && currentUser.risks) base = base.filter(function(r){ return currentUser.risks.indexOf(r.id)!==-1; });
    return base;
  }
  /* ---------------- PAGE TOOLBAR: one pattern on every page ----------------
     Sits directly under the page header: labelled rows of chips (มุมมอง / บริษัท / …) + a "แสดง N จาก M" line. */
  function tbRow(label, inner){ return '<div class="rf-row"><span class="rf-h">'+label+'</span><div class="rf-chips">'+inner+'</div></div>'; }
  function tbSum(shown, total, unit, active){
    return '<div class="rf-sum">แสดง <b>'+shown+'</b> จาก '+total+' '+unit+(active ? ' <button type="button" class="rf-clear" data-rk="clear">ล้างตัวกรอง</button>' : '')+'</div>';
  }
  function rkChip(key,val,label,on,count){
    return '<button type="button" class="rf-chip'+(on?' on':'')+'" data-rk="'+key+'" data-val="'+val+'" aria-pressed="'+on+'">'+label+(count!=null?'<span class="rf-n">'+count+'</span>':'')+'</button>';
  }
  function scopeRisks(){ return (typeof currentUser!=="undefined" && currentUser && currentUser.risks) ? RISKS.filter(function(r){ return currentUser.risks.indexOf(r.id)!==-1; }) : RISKS; }
  // company row for risk pages; countOf(companyId|"ALL") gives the number shown on each chip
  function companyRow(countOf){
    if(lockedScope()) return tbRow('บริษัท','<span class="lock" title="ขอบเขตข้อมูลตามสิทธิ์ของคุณ">'+icon("lock")+(currentUser.risks ? 'ความเสี่ยงที่รับผิดชอบ · '+esc(currentUser.risks.join(", ")) : 'เฉพาะ '+esc(lockedScope()))+'</span>');
    return tbRow('บริษัท', rkChip('co','ALL','ทั้งหมด',!activeFilter.length)+registerCompanyCols().map(function(c){
      return rkChip('co',c.id,'<b class="mono l'+c.layer+'">'+c.id+'</b>',activeFilter.indexOf(c.id)!==-1,countOf(c.id)); }).join(''));
  }
  function exampleTag(r){ return ''; }
  /* per-value example marker for REAL risks (example risks are already tagged as a whole) */
  function mockTag(r, on){ return ''; }
  function emptyState(msg){
    return '<div class="empty-state"><div class="big">ไม่พบข้อมูล</div>'+esc(msg)+'</div>';
  }
  function levelPill(level){ var m=LEVEL_META[level]||{cls:"pending"}; return '<span class="pill '+m.cls+'">'+esc(level)+'</span>'; }
  function statusPill(st){
    var map={crit:["crit","เกิน Tolerance"], watch:["watch","เฝ้าระวัง"], good:["good","ปกติ"], pending:["pending","รอข้อมูล"]};
    var m=map[st]||map.pending;
    return '<span class="pill '+m[0]+'">'+m[1]+'</span>';
  }
  function levelCounts(){
    var c={"สูงมาก":0,"สูง":0,"ปานกลาง":0,"ต่ำ":0};
    RISKS.forEach(function(r){ c[r.level]++; });
    return c;
  }
  function riskCountForSub(id){ return RISKS.filter(function(r){return r.sub===id;}).length; }
  // KPI องค์กร 3 ระดับ: PCC = Corporate KPI · Parent Company (Layer 2) และ Subsidiary Company (Layer 3) ใช้ Company KPI ชุดเดียวกัน
  function kpiLevelLabel(id){
    if(id==="PCC") return "Corporate KPI";
    var s=SUBS.filter(function(x){return x.id===id;})[0];
    if(!s) return "";
    return "Company KPI";
  }
  function worstLevelForSub(id){
    var order=["สูงมาก","สูง","ปานกลาง","ต่ำ"];
    var rs=RISKS.filter(function(r){return r.sub===id;});
    if(!rs.length) return null;
    var best=order.length;
    rs.forEach(function(r){ var i=order.indexOf(r.level); if(i<best) best=i; });
    return order[best];
  }
  function perspectiveMeta(code){ return BSC_PERSPECTIVES.filter(function(p){return p.code===code;})[0]; }
  function kpisForCompany(id){ return KPI_LIST.filter(function(k){ return k.applies.indexOf(id)!==-1; }); }

  // จัดกลุ่ม KPI ของบริษัทหนึ่ง ๆ ตามมุมมอง BSC (ตามลำดับ Strategic→Financial→Customer→Internal Process→L&G→ESG) แล้วตาม Strategic Objective ภายในมุมมองนั้น
  function renderKpiGroups(list){
    var byPersp={};
    list.forEach(function(k){ (byPersp[k.persp]=byPersp[k.persp]||[]).push(k); });
    return BSC_PERSPECTIVES.filter(function(p){return byPersp[p.code];}).map(function(p){
      var items=byPersp[p.code];
      var byObj={}, objOrder=[];
      items.forEach(function(k){
        if(!byObj[k.objective]){ byObj[k.objective]=[]; objOrder.push(k.objective); }
        byObj[k.objective].push(k);
      });
      var objHtml=objOrder.map(function(obj){
        var kriHtml=byObj[obj].map(function(k){
          return '<div class="unit-card"><div class="u">'+esc(k.id)+' · '+esc(k.target)+'</div><div class="t" style="white-space:pre-line;">'+esc(k.formula)+'</div></div>';
        }).join("");
        return '<div class="kpi-objective">'+esc(obj)+'</div>'+
          '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">'+kriHtml+'</div>';
      }).join("");
      return '<div class="persp-group-head"><span class="persp-chip" style="background:'+p.color+';">'+p.code+'</span>'+
        '<span style="font-weight:700;font-size:13.5px;color:'+p.color+';">'+esc(p.name)+'</span></div>'+
        objHtml;
    }).join("");
  }

  /* ---------------- RENDER: COMPANY KPI PANEL ---------------- */
  function renderCompanyPanel(id){
    if(!id){
      return '<div class="card"><h3>เป้าหมายบริษัท</h3>'+
        '<div class="hint">คลิกที่กล่อง PCC หรือบริษัทในผัง เพื่อดูเป้าหมาย KPI ของบริษัทนั้น ตามกรอบ Balanced Scorecard 6 มุมมอง</div>'+
      '</div>';
    }
    var s=SUBS.filter(function(x){return x.id===id;})[0];
    var fc=FILTER_COMPANIES.filter(function(x){return x.id===id;})[0];
    var legalName = fc ? fc.legal : (s ? s.th : id);
    var list=kpisForCompany(id);

    var header='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">'+
      '<div><div class="mono" style="font-weight:700;font-size:16.5px;">'+id+'</div><div style="font-size:13px;color:var(--ink-muted);">'+esc(legalName)+'</div></div>'+
      '<span class="lvl-tag" style="margin:0;">'+esc(kpiLevelLabel(id))+' · '+list.length+' ตัวชี้วัด</span>'+
    '</div>';

    var bodyHtml = list.length ?
      '<div style="margin-top:14px;">'+renderKpiGroups(list)+'</div>' :
      '<div style="margin-top:12px;">'+emptyState('ยังไม่มีข้อมูล KPI มาตรฐานของบริษัทนี้ในระบบ (กรอบ KPI ปัจจุบันครอบคลุม Corporate (PCC) และ Parent Company 5 บริษัท) — รอเชื่อมข้อมูลในเฟสถัดไป')+'</div>';

    return '<div class="card">'+header+bodyHtml+'</div>';
  }

  /* ---------------- RENDER: KPI REGISTER (cascade map: Corporate KPI <- Company KPI, one screen) ---------------- */
  var PARENT_COMPANIES = PRC.PARENT_COMPANIES;
  // flat company columns: each Parent Company followed by its Subsidiary Companies (Layer 2 + Layer 3 on one plane)
  function registerCompanyCols(){
    var cols=[{id:"PCC", layer:1}];
    PARENT_COMPANIES.forEach(function(pid){
      cols.push({id:pid, layer:2});
      SUBS.filter(function(x){ return x.parent===pid; }).forEach(function(k){ cols.push({id:k.id, layer:3, parent:pid}); });
    });
    return cols;
  }
  function escAttr(s){ return esc(s).replace(/"/g,"&quot;"); }
  function objectiveCode(o){ var m = /^([A-Za-z]+\d+)\./.exec(o); return m ? m[1] : o; }
  function objectiveTitle(o){ return o.replace(/^[A-Za-z]+\d+\.\s*/, ""); }
  function kpiById(id){ return KPI_LIST.filter(function(k){ return k.id===id; })[0]; }
  // Corporate KPI that is also measured, with the same definition, at the companies (one line instead of a COR + COM pair)
  function isCascade(k){ return k.level==="Corporate" && k.applies.some(function(c){ return c!=="PCC"; }); }
  // Corporate KPI -> Company KPI that roll up / drive it (explicit "drivers"; falls back to same objective)
  function buildKpiLinks(){
    var down={}, up={};
    KPI_LIST.forEach(function(k){ if(k.level!=="Corporate") up[k.id]=[]; });
    KPI_LIST.forEach(function(k){
      if(k.level!=="Corporate") return;
      var d = k.drivers || KPI_LIST.filter(function(x){ return x.level!=="Corporate" && objectiveCode(x.objective)===objectiveCode(k.objective); }).map(function(x){ return x.id; });
      down[k.id]=d;
      d.forEach(function(cid){ if(up[cid]) up[cid].push(k.id); });
    });
    return {down:down, up:up};
  }
  function registerDomains(){
    return BSC_PERSPECTIVES.map(function(p){
      var objs=[], seen={};
      KPI_LIST.forEach(function(k){
        if(k.persp!==p.code) return;
        var oc=objectiveCode(k.objective);
        if(!seen[oc]){ seen[oc]={code:oc, title:objectiveTitle(k.objective), corp:[], comp:[]}; objs.push(seen[oc]); }
        seen[oc][k.level==="Corporate"?"corp":"comp"].push(k);
      });
      return {p:p, objs:objs};
    }).filter(function(d){ return d.objs.length; });
  }
  function regMatch(k){
    if(regFilter.co!=="ALL" && k.applies.indexOf(regFilter.co)===-1) return false;
    if(regFilter.dom!=="ALL" && k.persp!==regFilter.dom) return false;
    if(regFilter.lvl!=="ALL" && k.level!==regFilter.lvl) return false;
    if(regFilter.tier!=="ALL" && String(OBJ_TIER[objectiveCode(k.objective)])!==regFilter.tier) return false;
    return true;
  }
  function regFilterBar(viewRow){
    function chip(key,val,label,extra,count){
      var on = regFilter[key]===val;
      return '<button type="button" class="rf-chip'+(on?' on':'')+'" data-rf="'+key+'" data-val="'+val+'" aria-pressed="'+on+'"'+(extra||'')+'>'+label+
        (count!=null?'<span class="rf-n">'+count+'</span>':'')+'</button>';
    }
    var cos = registerCompanyCols().map(function(c){
      var n = KPI_LIST.filter(function(k){ return k.applies.indexOf(c.id)!==-1; }).length;
      return chip('co', c.id, '<b class="mono l'+c.layer+'">'+c.id+'</b>', '', n);
    }).join('');
    var doms = BSC_PERSPECTIVES.map(function(p){
      var n = KPI_LIST.filter(function(k){ return k.persp===p.code; }).length;
      return chip('dom', p.code, '<i class="rf-dc" style="background:'+p.color+'"></i>'+esc(p.name), '', n);
    }).join('');
    var nCorp = KPI_LIST.filter(function(k){ return k.level==="Corporate"; }).length;
    var lvls = chip('lvl','Corporate','<i class="cm-sw corp"></i>Corporate KPI','',nCorp)+
               chip('lvl','Company','<i class="cm-sw comp"></i>Company KPI','',KPI_LIST.length-nCorp);
    var tiers = [1,2,3].map(function(t){
      var n = KPI_LIST.filter(function(k){ return OBJ_TIER[objectiveCode(k.objective)]===t; }).length;
      var objs = Object.keys(OBJ_TIER).filter(function(c){ return OBJ_TIER[c]===t; }).join(' ');
      return chip('tier', String(t), '<span class="tier t'+t+'">T'+t+'</span>'+TIERS[t].name, ' title="'+escAttr(TIERS[t].def+' · '+objs)+'"', n);
    }).join('');
    var shown = KPI_LIST.filter(regMatch).length;
    var active = regFilter.co!=="ALL" || regFilter.dom!=="ALL" || regFilter.lvl!=="ALL" || regFilter.tier!=="ALL";
    if(overviewView!=="table") return '<div class="rf tb">'+viewRow+'</div>';
    return '<div class="rf tb">'+viewRow+
      '<div class="rf-row"><span class="rf-h">บริษัท</span><div class="rf-chips">'+chip('co','ALL','ทั้งหมด')+cos+'</div></div>'+
      '<div class="rf-row"><span class="rf-h">Domain</span><div class="rf-chips">'+chip('dom','ALL','ทั้งหมด')+doms+'</div></div>'+
      '<div class="rf-row"><span class="rf-h">ระดับ</span><div class="rf-chips">'+chip('lvl','ALL','ทั้งหมด')+lvls+'</div></div>'+
      '<div class="rf-row"><span class="rf-h">Tier</span><div class="rf-chips">'+chip('tier','ALL','ทั้งหมด')+tiers+'</div></div>'+
      '<div class="rf-sum">แสดง <b>'+shown+'</b> จาก '+KPI_LIST.length+' KPI'+
        (regFilter.co!=="ALL" ? ' · KPI ที่ <b>'+regFilter.co+'</b> วัด' : '')+
        (active ? ' <button type="button" class="rf-clear" data-rf="clear">ล้างตัวกรอง</button>' : '')+'</div>'+
    '</div>';
  }
  function cmKpiLine(k, links){
    var isCorp = k.level==="Corporate";
    var ups = (!isCorp && links) ? (links.up[k.id]||[]) : [];
    var tip = k.id+' · '+k.target+(ups.length ? ' → ส่งผลต่อ '+ups.join(', ') : '');
    var dots = '<span class="cm-dots">'+registerCompanyCols().map(function(c){
      var on = k.applies.indexOf(c.id)!==-1;
      if(on) return '<i class="cm-dot on'+(regFilter.co===c.id?' pin':'')+'" title="'+c.id+' · ใช้ KPI นี้"></i>';
      var sameLevel = isCascade(k) ? true : (isCorp ? c.layer===1 : c.layer>=2);
      if(!sameLevel) return '<i class="cm-dot na"></i>';
      return '<i class="cm-dot" title="'+c.id+' · ไม่ใช้"></i>';
    }).join('')+'</span>';
    return '<button type="button" class="cm-kpi'+(isCorp?' corp':' comp')+(selectedKpi===k.id?' active':'')+'" data-kpi="'+k.id+'" title="'+escAttr(tip)+'">'+
      '<span class="cm-id mono">'+k.id+'</span><span class="cm-target">'+esc(k.target)+'</span>'+dots+'</button>';
  }
  function cmRowLv(){ return Math.min(cmLevel,3); }
  function cmEff(code){ return cmObj[code] || cmRowLv(); }
  function cmFull(v, ncom){ return v===3 || (v===2 && !ncom); }
  function cmLvHtml(){
    var t={1:'แสดงเฉพาะ Strategic Objective',2:'แสดงถึง Corporate KPI',3:'แสดงถึง Company KPI',4:'แสดงทั้งหมด พร้อมคอลัมน์บริษัท'};
    var clean=!Object.keys(cmObj).length && !Object.keys(cmDom).length;
    return '<span class="cm-lv" role="group" aria-label="ระดับการแสดงผล">'+[1,2,3,4].map(function(n){
      return '<button type="button" data-cmlv="'+n+'" class="'+(clean && cmLevel===n?'on':'')+'" title="'+t[n]+'">'+n+'</button>';
    }).join('')+'</span>';
  }
  /* update grouping in place (no re-render, keeps scroll) */
  function cmApply(){
    var cm=document.querySelector("#page-overview .cm"); if(!cm) return;
    cm.querySelectorAll(".cm-row[data-obj]").forEach(function(row){
      var v=cmEff(row.getAttribute("data-obj")), full=cmFull(v, +row.getAttribute("data-ncom"));
      row.classList.remove("v1","v2","v3"); row.classList.add("v"+v);
      var b=row.querySelector(".cm-tg"); if(b){ b.textContent=full?"\u2212":"+"; b.setAttribute("aria-expanded", full?"true":"false"); }
    });
    cm.querySelectorAll(".cm-domain[data-dom]").forEach(function(d){
      var shut=!!cmDom[d.getAttribute("data-dom")]; d.classList.toggle("shut", shut);
      var b=d.querySelector(".cm-dhead .cm-tg"); if(b){ b.textContent=shut?"+":"\u2212"; b.setAttribute("aria-expanded", shut?"false":"true"); }
    });
    /* company columns: keep only those with a dot among visible KPI lines; the whole group folds like an Excel column group */
    var nCol=registerCompanyCols().length, used=[], anyKpi=false;
    for(var i=0;i<nCol;i++) used.push(false);
    cm.querySelectorAll(".cm-domain[data-dom]").forEach(function(d){
      if(cmDom[d.getAttribute("data-dom")]) return;
      d.querySelectorAll(".cm-row[data-obj]").forEach(function(row){
        var v=cmEff(row.getAttribute("data-obj"));
        row.querySelectorAll(".cm-kpi").forEach(function(k){
          if(!(v===3 || (v===2 && k.classList.contains("corp")))) return;
          anyKpi=true;
          var ds=k.querySelector(".cm-dots"); if(!ds) return;
          for(var j=0;j<ds.children.length;j++) if(ds.children[j].classList.contains("on")) used[j]=true;
        });
      });
    });
    cm.classList.toggle("cm-nokpi", !anyKpi);
    var coShut = cmLevel<4; cm.classList.toggle("cm-coshut", coShut);
    cm.querySelectorAll(".cm-dots").forEach(function(ds){
      for(var j=0;j<ds.children.length;j++){ ds.children[j].classList.toggle("cx-off", !used[j]); ds.children[j].classList.toggle("cx-grp", coShut); }
    });
    clearCross();
    var clean=!Object.keys(cmObj).length && !Object.keys(cmDom).length;
    document.querySelectorAll("#page-overview [data-cmlv]").forEach(function(b){ b.classList.toggle("on", clean && +b.getAttribute("data-cmlv")===cmLevel); });
    syncStickyTop();
  }
  function renderKpiRegisterCard(){
    var domains = registerDomains();
    var links = buildKpiLinks();
    var objs=[]; domains.forEach(function(d){ objs = objs.concat(d.objs); });
    var nObj = objs.length;
    var objNoCorp = objs.filter(function(o){ return !o.corp.length; }).map(function(o){ return o.code; });
    var corpIds = Object.keys(links.down);
    var corpNoComp = corpIds.filter(function(id){ return !links.down[id].length && !isCascade(kpiById(id)); });
    var compIds = Object.keys(links.up);
    var compBad = compIds.filter(function(id){ return links.up[id].length!==1; });
    var nCorp = corpIds.length;
    var nComp = KPI_LIST.length - nCorp;
    function ruleNote(label, okCount, total, missing){
      var ok = !missing.length;
      return '<span class="cm-rule '+(ok?'ok':'gap')+'"><i class="mk">'+(ok?'&#10003;':'&#9888;')+'</i> '+label+' <b>'+okCount+'/'+total+'</b>'+(missing.length?' <span class="mono">ต้องแก้: '+missing.join(' ')+'</span>':'')+'</span>';
    }

    var stats = '<div class="cm-stats">'+
      '<span class="cm-stat"><b>'+nObj+'</b> Strategic Objective</span>'+
      '<span class="cm-stat"><b>'+KPI_LIST.length+'</b> KPI รวม</span>'+
      '<span class="cm-stat"><i class="cm-sw corp"></i><b>'+nCorp+'</b> Corporate KPI</span>'+
      '<span class="cm-stat"><i class="cm-sw comp"></i><b>'+nComp+'</b> Company KPI</span>'+
      '<span class="cm-lv-m">ย่อ/ขยาย '+cmLvHtml()+'</span>'+
    '</div>';
    var foot = '<div class="cm-foot">'+
      '<div class="cm-foot-row"><span class="cm-foot-h">ตรวจความเชื่อมโยง</span>'+
        ruleNote('ทุก Strategic Objective มี Corporate KPI', nObj-objNoCorp.length, nObj, objNoCorp)+
        ruleNote('ทุก Corporate KPI มี Company KPI รองรับ หรือวัดต่อที่บริษัท', nCorp-corpNoComp.length, nCorp, corpNoComp)+
        ruleNote('Company KPI แต่ละตัวส่งเสริม Corporate KPI 1 ตัว', compIds.length-compBad.length, compIds.length, compBad)+
      '</div>'+
      '<div class="cm-foot-row"><span class="cm-foot-h">Tier (Holding focus)</span>'+
        [1,2,3].map(function(t){ return '<span><span class="tier t'+t+'">T'+t+'</span> <b>'+TIERS[t].name+'</b> — '+esc(TIERS[t].def)+'</span>'; }).join('')+
      '</div>'+
      '<div class="cm-foot-row"><span class="cm-foot-h">กติกาการติดตาม</span>'+
        '<span>1. Holding ดู Corporate KPI ตามรอบของ Tier</span>'+
        '<span>2. Company KPI บริษัทย่อยดูเอง ส่งขึ้นมาเมื่อ KRI เกิน Tolerance</span>'+
        '<span>3. KPI ที่เป้า = 0 ครั้ง รายงานทันทีที่เกิด</span>'+
      '</div>'+
      '<div class="cm-foot-row"><span class="cm-foot-h">สัญลักษณ์</span>'+
        '<span><i class="cm-sw corp"></i> Corporate KPI</span>'+
        '<span><i class="cm-sw comp"></i> Company KPI</span>'+
        '<span><span style="color:var(--good-line)">&#9679;</span> ใช้ KPI</span>'+
        '<span><span style="color:var(--ink-faint)">&#9675;</span> ไม่ใช้</span>'+
        '<span><span style="color:var(--brand-700);font-weight:700">&#8644;</span> KPI ที่เชื่อมโยงกัน (ชี้เมาส์ที่ KPI)</span>'+
        '<span>คลิก KPI เพื่อดูสูตรคำนวณ</span>'+
      '</div>'+
      '<div class="cm-foot-row"><span class="cm-foot-h">รูปแบบรหัส KPI</span>'+
        '<span><span class="mono">[Strategic Objective]-[ระดับ]-[ลำดับ]</span></span>'+
        '<span><span class="mono co">COR</span> = Corporate KPI (ถ้ามีจุดเขียวที่บริษัท = ใช้ตัวชี้วัดเดียวกันทั้งระดับกลุ่มและบริษัท)</span>'+
        '<span><span class="mono pc">COM</span> = Company KPI (ใช้ได้ทั้ง Parent Company และ Subsidiary Company)</span>'+
      '</div>'+
    '</div>';

    var head = '<div class="cm-head">'+
      '<div class="cm-h cm-h-dom">'+cmLvHtml()+'Domain</div>'+
      '<div class="cm-h-rows">'+
        '<div class="cm-h">Objective</div>'+
        '<div class="cm-h cm-h-kpi"><span class="cm-h-t">รายการ KPI</span>'+
          '<span class="cm-h-co"><span class="cm-dots cm-dots-head">'+registerCompanyCols().map(function(c){
            var t = c.layer===1 ? ' · Corporate (Layer 1)' : c.layer===2 ? ' · Parent Company (Layer 2)' : ' · Subsidiary Company ของ '+c.parent+' (Layer 3)';
            return '<b class="mono l'+c.layer+(regFilter.co===c.id?' pin':'')+'" title="'+c.id+t+'">'+c.id+'</b>';
          }).join('')+'</span></span></div>'+
      '</div>'+
    '</div>';

    var body = domains.map(function(d){
      var nDomObj=0, nDomKpi=0, dShut=!!cmDom[d.p.code];
      var rows = d.objs.map(function(o){
        var fc=o.corp.filter(regMatch), fm=o.comp.filter(regMatch);
        var lines = fc.map(function(k){ return cmKpiLine(k, links); }).join('') +
                    fm.map(function(k){ return cmKpiLine(k, links); }).join('');
        if(!lines) return '';
        nDomObj++; nDomKpi += fc.length+fm.length;
        var v=cmEff(o.code), full=cmFull(v, fm.length);
        lines += '<button type="button" class="cm-more m1" data-cmx="'+o.code+'">+ '+(fc.length+fm.length)+' KPI</button>'+
                 (fm.length ? '<button type="button" class="cm-more m2" data-cmx="'+o.code+'">+ '+fm.length+' Company KPI</button>' : '');
        return '<div class="cm-row v'+v+'" data-obj="'+o.code+'" data-ncom="'+fm.length+'">'+
          '<div class="cm-obj"><button type="button" class="cm-tg" data-cmobj="'+o.code+'" aria-expanded="'+full+'" title="ย่อ/ขยาย '+o.code+'">'+(full?'&minus;':'+')+'</button><span class="cm-oc mono">'+o.code+'</span><span class="cm-ot">'+esc(o.title)+' '+tierBadge(o.code)+
            (function(){ var g=risksForObjective(RISKS,o.code), n=g.primary.length+g.related.length;
              return n ? '<button type="button" class="obj-risk" data-goto-obj="'+o.code+'" title="ดูความเสี่ยงที่ผูกกับ '+o.code+'">&#9888; '+n+' ความเสี่ยง</button>' : ''; })()+
          '</span></div>'+
          '<div class="cm-lines">'+lines+'</div>'+
        '</div>';
      }).join('');
      if(!rows) return '';
      rows += '<div class="cm-dsum">'+nDomObj+' Strategic Objective · '+nDomKpi+' KPI</div>';
      return '<div class="cm-domain'+(dShut?' shut':'')+'" data-dom="'+d.p.code+'" style="--dc:'+d.p.color+';">'+
        '<div class="cm-dhead" title="'+escAttr(purposeText(d.p.purpose))+'"><button type="button" class="cm-tg" data-cmdom="'+d.p.code+'" aria-expanded="'+!dShut+'" title="ย่อ/ขยาย Domain">'+(dShut?'+':'&minus;')+'</button><span class="persp-chip" style="background:'+d.p.color+';">'+d.p.code+'</span>'+
          '<span class="cm-dname">'+esc(d.p.name)+'<small>'+Math.round(d.p.weight*100)+'%</small></span></div>'+
        '<div class="cm-rows">'+rows+'</div>'+
      '</div>';
    }).join('');

    return '<div class="card">'+
      '<div class="card-head"><h3>ทะเบียนคุม KPI (KPI Register)</h3>'+
        '<div class="exp-btns" role="group" aria-label="ส่งออกทะเบียน KPI"><button type="button" class="btn-exp" data-export="xlsx" title="ทะเบียน KPI ตามตัวกรองที่เลือก เป็นไฟล์ Excel">'+icon("download")+'Excel</button><button type="button" class="btn-exp" data-export="pdf" title="ทะเบียน KPI ตามที่แสดงบนจอ เป็นไฟล์ PDF">'+icon("download")+'PDF</button></div></div>'+
      stats+
      '<div class="cm">'+head+(body || '<div class="cm-empty" style="padding:18px 8px;">ไม่มี KPI ที่ตรงกับตัวกรองนี้</div>')+'<div class="cm-colband" aria-hidden="true"></div></div>'+
      foot+
    '</div>';
  }
  function renderKpiDetail(id){
    var k = kpiById(id); if(!k) return '';
    var p = perspectiveMeta(k.persp);
    var oc = objectiveCode(k.objective);
    var isCorp = k.level==="Corporate";
    var lk2 = buildKpiLinks();
    var links = isCorp ? (lk2.down[k.id]||[]) : (lk2.up[k.id]||[]);
    var casc = isCascade(k);
    var linkLabel = isCorp ? 'Company KPI ที่ส่งผลต่อ KPI นี้' : 'KPI นี้ส่งผลต่อ Corporate KPI';
    var linkHtml = links.length ? links.map(function(lid){
      var lk = kpiById(lid);
      return '<button type="button" class="cm-kpi '+(isCorp?'comp':'corp')+'" data-kpi="'+lid+'"><span class="cm-id mono">'+lid+'</span><span class="cm-target">'+esc(lk.target)+'</span></button>';
    }).join('') : '<span class="cm-empty">'+(casc?'ไม่มี Company KPI แยก เพราะบริษัทวัดตัวชี้วัดเดียวกันนี้':(isCorp?'ไม่มี Company KPI':'ไม่มี Corporate KPI'))+'</span>';
    var applies = k.applies.map(function(c){ return '<span class="pill good">'+c+'</span>'; }).join(' ');
    return '<div class="card kpi-detail">'+
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'+
        '<span class="persp-chip" style="background:'+p.color+';">'+p.code+'</span>'+
        '<span class="mono" style="font-weight:700;font-size:17px;">'+k.id+'</span>'+
        '<span class="lvl-tag" style="margin:0;">'+(casc?'Corporate KPI · วัดทั้งกลุ่มและบริษัท':(isCorp?'Corporate KPI · Layer 1':'Company KPI · Layer 2–3'))+'</span>'+
      '</div>'+
      '<div class="kd-label">Strategic Objective ('+esc(p.name)+')</div><div class="kd-text">'+esc(k.objective)+'</div>'+
      '<div class="kd-label">KPI &amp; เป้าหมาย</div><div class="kd-text kd-strong">'+esc(k.target)+'</div>'+
      '<div class="kd-label">นิยาม / สูตรคำนวณ</div><div class="kd-text" style="white-space:pre-line;">'+esc(k.formula)+'</div>'+
      '<div class="kd-label">บริษัทที่ใช้</div><div class="kd-text">'+applies+'</div>'+
      '<div class="kd-label">'+linkLabel+'</div><div class="kd-links">'+linkHtml+'</div>'+
    '</div>';
  }

  /* ---------------- RENDER: OVERVIEW (โครงสร้างการถือหุ้น + เป้าหมาย) ---------------- */
  function renderOverview(){
    function kpiCountPill(id, faintColor){
      var cnt=kpisForCompany(id).length;
      var faint='color:'+(faintColor||'var(--ink-faint)');
      if(!cnt) return '<span class="pill pending">รอข้อมูล KPI</span>';
      return '<span class="pill good">มีเป้าหมาย KPI</span> <span style="font-size:12px;'+faint+'">('+cnt+' ตัวชี้วัด)</span>';
    }
    function subLevelPill(s){ return kpiCountPill(s.id); }
    var topSubs=SUBS.filter(function(s){return !s.parent;});

    var orgRow=topSubs.map(function(s){
      var kids=SUBS.filter(function(c){return c.parent===s.id;});
      var expanded = kids.length>0 && !collapsedParents[s.id];
      var toggleBtn = kids.length ? '<button type="button" class="org-expand-toggle" data-parent="'+s.id+'">'+
        (expanded ? '&#9662; ซ่อน' : '&#9656; '+kids.length+' บริษัทย่อย')+'</button>' : '';
      var kidsHtml = expanded ? '<div class="org-kid-stem"></div><div class="org-kids-row">'+kids.map(function(k){
        return '<div class="org-kid'+(selectedCompany===k.id?' active':'')+'" data-sub="'+k.id+'"><div class="cid">'+k.id+'</div>'+kpiCountPill(k.id)+'</div>';
      }).join("")+'</div>' : '';
      var nodeHtml='<div class="org-node'+(s.pending?' pending':'')+(selectedCompany===s.id?' active':'')+'" data-sub="'+s.id+'">'+
        '<div class="org-node-top"><div class="id">'+s.id+'</div>'+toggleBtn+'</div>'+
        '<div class="lv">'+subLevelPill(s)+'</div>'+
      '</div>';
      return '<div class="org-branch">'+nodeHtml+kidsHtml+'</div>';
    }).join("");

    var corporateCount=kpisForCompany("PCC").length;
    var weightBarHtml=BSC_PERSPECTIVES.map(function(p){
      var pct=Math.round(p.weight*100);
      var tight = p.weight<=0.1 ? ' tight' : '';
      return '<button type="button" class="bsc-seg'+tight+'" data-dom="'+p.code+'" aria-expanded="false" aria-controls="domDetail" style="flex-grow:'+p.weight+';background:'+p.color+';">'+esc(p.name)+' = '+pct+'%</button>';
    }).join("");
    var groupCard='<div class="card kpi-level">'+
      '<span class="lvl-tag">KPI Framework · 6 Domain</span>'+
      '<div class="bsc-weight-bar" style="margin-top:12px;">'+weightBarHtml+'</div>'+
      '<div class="dom-detail" id="domDetail" role="region" aria-live="polite"><div class="dd-in"><span class="dd-hint">ชี้หรือแตะที่แถบสีเพื่อดูเป้าประสงค์ของแต่ละ Domain</span></div></div>'+
    '</div>';

    var modalHtml = selectedCompany ? (
      '<div class="modal-backdrop" id="companyModalBackdrop">'+
        '<div class="modal-box">'+
          '<button type="button" class="modal-close" id="companyModalClose" aria-label="ปิด">&times;</button>'+
          renderCompanyPanel(selectedCompany)+
        '</div>'+
      '</div>'
    ) : '';

    var orgChartCard = '<div class="card"><h3>โครงสร้างกลุ่มบริษัท (Shareholding Structure)</h3>'+
      '<div class="org-legend">'+
        '<span><i style="background:var(--layer-corp);"></i>Layer 1 &middot; Corporate (PCC)</span>'+
        '<span><i style="background:var(--layer-parent);"></i>Layer 2 &middot; Parent Company</span>'+
        '<span><i style="background:var(--layer-sub);"></i>Layer 3 &middot; Subsidiary Company</span>'+
      '</div>'+
      '<div class="org">'+
        '<div class="org-parent'+(selectedCompany==="PCC"?' active':'')+'" data-sub="PCC"><div class="n">PCC</div><div class="d">Holding · 3 สายธุรกิจ</div><div class="lv">'+kpiCountPill('PCC')+'</div></div>'+
        '<div class="org-stem"></div>'+
        '<div class="org-row">'+orgRow+'</div>'+
      '</div>'+
      '<div class="hint">คลิกบริษัทเพื่อดู KPI</div>'+
    '</div>';

    var viewToggle = '<div class="view-toggle">'+
      '<button type="button" class="view-toggle-btn'+(overviewView==="table"?' active':'')+'" data-view="table">'+icon("table")+'ทะเบียนคุม KPI</button>'+
      '<button type="button" class="view-toggle-btn'+(overviewView==="chart"?' active':'')+'" data-view="chart">'+icon("tree")+'ผังโครงสร้าง</button>'+
    '</div>';

    return ''+
    '<div class="page-head"><div><h2>Objectives &amp; KPI</h2><div class="sub">ข้อมูลอ้างอิงจากแผนกลยุทธ์ ทบทวนปีละครั้ง · Corporate KPI (PCC) &rarr; Company KPI · ระบบความเสี่ยงใช้เพื่อผูกความเสี่ยงเข้ากับเป้าหมาย</div></div>'+
      '</div>'+
    regFilterBar(tbRow('มุมมอง', viewToggle))+
    groupCard+
    (overviewView==="chart" ? orgChartCard : renderKpiRegisterCard())+
    modalHtml+
    ''+
    (selectedKpi ? (
      '<div class="modal-backdrop" id="kpiModalBackdrop">'+
        '<div class="modal-box">'+
          '<button type="button" class="modal-close" id="kpiModalClose" aria-label="ปิด">&times;</button>'+
          renderKpiDetail(selectedKpi)+
        '</div>'+
      '</div>'
    ) : '');
  }

  /* ---------------- RENDER: MATRIX ---------------- */
  function matrixCounts(list){
    var grid={};
    list.forEach(function(r){ var k=r.L+"-"+r.I; grid[k]=(grid[k]||0)+1; });
    return grid;
  }
  function levelForLI(L,I){
    var v=L*I;
    if(v>=12) return "l-crit"; if(v>=8) return "l-high"; if(v>=6) return v===6&&L<I? "l-mid":"l-mid"; if(v>=3) return "l-mid"; return "l-low";
  }
  function levelForLICorrect(L,I){
    // follow company table exactly
    var table={
      "1-1":"l-low","1-2":"l-low","1-3":"l-mid","1-4":"l-high",
      "2-1":"l-low","2-2":"l-mid","2-3":"l-mid","2-4":"l-high",
      "3-1":"l-mid","3-2":"l-mid","3-3":"l-high","3-4":"l-crit",
      "4-1":"l-high","4-2":"l-high","4-3":"l-crit","4-4":"l-crit"
    };
    return table[L+"-"+I]||"l-low";
  }
  function renderMatrix(){
    var list=filteredRisks();
    var counts=matrixCounts(list);
    var rowsHtml="";
    for(var L=4; L>=1; L--){
      rowsHtml += '<div class="m-axis-y" style="grid-row:'+(5-L)+';grid-column:1">L='+L+'</div>';
    }
    var cellsHtml="";
    for(var Lx=4; Lx>=1; Lx--){
      for(var Ix=1; Ix<=4; Ix++){
        var n=counts[Lx+"-"+Ix]||0;
        var cls=levelForLICorrect(Lx,Ix);
        cellsHtml += (n>0
          ? '<button type="button" class="m-cell m-go '+cls+'" data-cell="'+Lx+'-'+Ix+'" style="grid-row:'+(5-Lx)+';grid-column:'+(Ix+1)+'" title="L='+Lx+' × I='+Ix+' · '+n+' ประเด็น — คลิกเพื่อดูรายชื่อในทะเบียน">'
          : '<div class="m-cell '+cls+' empty" style="grid-row:'+(5-Lx)+';grid-column:'+(Ix+1)+'" title="L='+Lx+' × I='+Ix+' · ไม่มีประเด็น">')+
          '<div class="n">'+(n>0?n:"")+'</div>'+(n>0?'</button>':'</div>');
      }
    }
    var xAxisCells='<div class="m-corner" style="grid-row:5;grid-column:1"></div>'+
      [1,2,3,4].map(function(i){ return '<div class="m-axis-x" style="grid-row:5;grid-column:'+(i+1)+'">I='+i+'</div>'; }).join("");


    var LV=["สูงมาก","สูง","ปานกลาง","ต่ำ"], LVC={"สูงมาก":"crit","สูง":"high","ปานกลาง":"watch","ต่ำ":"good"};
    function tally(rs){ var c={"สูงมาก":0,"สูง":0,"ปานกลาง":0,"ต่ำ":0}; rs.forEach(function(r){ c[r.level]++; }); return c; }
    // stacked horizontal bars: one row per group, segments by risk level (fixed order สูงมาก→ต่ำ)
    function stackRows(groups){
      var max=Math.max.apply(null, groups.map(function(g){ return g.rs.length; }).concat([1]));
      return '<div class="rs-bars">'+groups.map(function(g){
        var c=tally(g.rs), n=g.rs.length;
        var segs = LV.filter(function(l){ return c[l]; }).map(function(l){
          return '<i class="rs-seg '+LVC[l]+'" style="flex-grow:'+c[l]+'" title="'+escAttr(g.label+' · '+l+' '+c[l]+' ประเด็น')+'"></i>'; }).join('');
        return '<div class="rs-bar-row"><span class="rs-bar-lab">'+g.labelHtml+'</span>'+
          '<span class="rs-bar-track"><span class="rs-bar" style="width:'+(n/max*100)+'%">'+segs+'</span></span>'+
          '<span class="rs-bar-n mono">'+n+'</span></div>';
      }).join('')+'</div>';
    }
    var byCo = registerCompanyCols().filter(function(c){ return inSel(activeFilter, c.id); }).map(function(c){
      return {label:c.id, labelHtml:'<b class="mono l'+c.layer+'">'+c.id+'</b>', rs:list.filter(function(r){ return r.sub===c.id; })}; });
    var byDom = BSC_PERSPECTIVES.map(function(p){
      return {label:p.name, labelHtml:'<span class="persp-chip" style="background:'+p.color+';">'+p.code+'</span>'+esc(p.name), rs:list.filter(function(r){ return r.objs && r.objs[0] && r.objs[0].charAt(0)===p.code; })}; });
    var legend = '<div class="rs-key" role="note"><b>ระดับความเสี่ยง</b>'+LV.map(function(l){ return '<span><i class="rs-sw '+LVC[l]+'"></i>'+l+'</span>'; }).join('')+'</div>';
    // KRI counts for the stat tiles
    var krisAll=[]; list.forEach(function(r){ r.kris.forEach(function(k){ krisAll.push({r:r,k:k}); }); });
    var nCrit=krisAll.filter(function(o){ return o.k.status==="crit"; }).length, nWatch=krisAll.filter(function(o){ return o.k.status==="watch"; }).length, nPend=krisAll.filter(function(o){ return o.k.status==="pending"; }).length;
    var cTally=tally(list);
    var nObj=registerDomains().reduce(function(a,d){ return a+d.objs.length; },0);
    var coveredObj=registerDomains().reduce(function(a,d){ return a+d.objs.filter(function(o){ return list.some(function(r){ return r.objs && r.objs.indexOf(o.code)!==-1; }); }).length; },0);
    var scope = !activeFilter.length ? "ทั้งกลุ่ม" : (activeFilter.length<=3 ? activeFilter.join(", ") : activeFilter.length+" บริษัท");

    return ''+
    '<div class="page-head"><div><h2>Home</h2><div class="sub">สรุปสถานะความเสี่ยงของ'+(activeFilter.length?' ':'')+scope+' สำหรับที่ประชุม President และ RMC — ระดับความเสี่ยง = โอกาสเกิด (L) × ผลกระทบ (I)</div></div>'+'</div>'+
    '<div class="rf tb">'+companyRow(function(id){ return scopeRisks().filter(function(r){ return r.sub===id; }).length; })+
      tbSum(list.length, scopeRisks().length, 'ประเด็นความเสี่ยง', activeFilter.length>0 && !lockedScope())+'</div>'+
    '<div class="grid grid-4">'+
      '<div class="stat"><div class="lbl">ประเด็นความเสี่ยง</div><div class="val mono">'+list.length+'</div><div class="rs-sub">ครอบคลุม '+coveredObj+' จาก '+nObj+' Strategic Objective</div></div>'+
      '<div class="stat crit"><div class="lbl">ระดับสูงมาก</div><div class="val mono">'+cTally["สูงมาก"]+'</div><div class="rs-sub">สูง '+cTally["สูง"]+' · ปานกลาง '+cTally["ปานกลาง"]+' · ต่ำ '+cTally["ต่ำ"]+'</div></div>'+
      '<div class="stat crit"><div class="lbl">KRI เกิน Tolerance</div><div class="val mono">'+nCrit+'</div><div class="rs-sub">'+(function(){ var kw=revCompare(ROUNDS[ROUNDS.length-2]||"", ROUNDS[ROUNDS.length-1]||"", list).kw.length; return (kw?'<b class="ov-up">แย่ลงจากเดือนก่อน '+kw+'</b> · ':'')+'เฝ้าระวัง '+nWatch; })()+'</div></div>'+
      (function(){ var nLate=0, ineff=0; list.forEach(function(r){ r.factors.forEach(function(f, fi){ (f.acts||[]).forEach(function(a){ var st=actState(a); if(st==="late") nLate++; if(st==="done" && factorCrit(r,fi)) ineff++; }); }); });
        return '<div class="stat'+(nLate?' crit':'')+'"><div class="lbl">แนวทางจัดการล่าช้า</div><div class="val mono">'+nLate+'</div><div class="rs-sub">'+(ineff?'<b class="ov-up">เสร็จแล้วแต่ KRI ยังเกิน Tolerance '+ineff+'</b>':'ไม่มีแนวทางที่เสร็จแล้วแต่ KRI ยังเกิน')+'</div></div>'; })()+
    '</div>'+
    legend+
    '<div class="grid rs-grid">'+
      '<div class="card">'+
        '<h3>Risk Heat Map — '+scope+' ('+list.length+' ประเด็น)</h3>'+
        '<div class="matrix">'+rowsHtml+cellsHtml+xAxisCells+'</div>'+
        '<div class="m-title" style="margin-top:6px;">แกนนอน: ผลกระทบ (Impact) · แกนตั้ง: โอกาสเกิด (Likelihood) · คลิกช่องเพื่อดูรายชื่อ</div>'+
      '</div>'+
      '<div class="card"><h3>ความเสี่ยงแยกตามบริษัท</h3>'+stackRows(byCo)+'</div>'+
      '<div class="card"><h3>ความเสี่ยงแยกตาม Domain (Strategic Objective)</h3>'+stackRows(byDom)+'</div>'+
    '</div>'+
    ovDecide(list)+
    renderRiskModal();
  }

  /* ---------------- SHARED: RISK REGISTER TABLE ---------------- */
  var LVL_CLS={"สูงมาก":"crit","สูง":"high","ปานกลาง":"watch","ต่ำ":"good"};
  function riskSort(a,b){ return (b.L*b.I)-(a.L*a.I) || (b.L-a.L) || (a.example?1:0)-(b.example?1:0) || (a.id<b.id?-1:1); }
  function dataBadge(r){
    if(!r.example) return '<span class="db db-real" title="ข้อมูลจากเอกสารที่ RMC พิจารณาแล้ว">ข้อมูลจริง</span>';
    if(r.sub==="PCC") return '<span class="db db-pend" title="วิเคราะห์จาก Corporate KPI รอ Risk Owner ยืนยัน">รอยืนยัน</span>';
    return '<span class="db db-ex" title="ตัวอย่างเพื่อให้เห็นภาพ รอข้อมูลจริง">ตัวอย่าง</span>';
  }
  function registerTableHtml(list){
    if(!list.length) return emptyState('ไม่พบประเด็นความเสี่ยงตามเงื่อนไขนี้');
    var rows=list.slice().sort(riskSort).map(function(r){
      return '<tr class="rs-row" data-risk="'+r.id+'" title="คลิกเพื่อดูรายละเอียด">'+
        '<td class="mono rg-id">'+r.id+'</td>'+
        '<td class="rg-co">'+subName(r.sub)+'</td>'+
        '<td class="rg-title">'+esc(r.title)+'</td>'+
        '<td class="mono rgt-obj">'+(r.objs||[]).join(' · ')+'</td>'+
        '<td class="mono rg-li '+LVL_CLS[r.level]+'" title="'+escAttr(r.level)+'">'+r.L+'×'+r.I+'</td>'+
        '<td class="rg-own'+(r.owner?'':' none')+'">'+esc(r.owner||'ยังไม่ระบุ')+mockTag(r, r.ownerMock)+'</td></tr>';
    }).join("");
    return '<div class="tbl-wrap"><table class="rg-tbl"><thead><tr><th>รหัส</th><th>บริษัท</th><th>ความเสี่ยง</th><th>กระทบเป้า</th><th>L×I</th><th>ผู้รับผิดชอบ</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }

  /* ---------------- RENDER: KRI MONITORING ---------------- */
  function renderKri(){
    var list=filteredRisks();
    var ST=[["crit","เกิน Tolerance"],["watch","เฝ้าระวัง"],["good","ปกติ"],["pending","รอข้อมูล"]];
    var stCount={crit:0,watch:0,good:0,pending:0}, totalAll=0;
    list.forEach(function(r){ r.kris.forEach(function(k){ totalAll++; stCount[k.status]=(stCount[k.status]||0)+1; }); });
    var rowsHtml = list.map(function(r){
      var rows = r.kris.map(function(k,ki){
        if(!inSel(kriSt, k.status)) return '';
        return '<tr class="rs-row" data-risk="'+r.id+'" data-hsel="kri:'+ki+'" title="คลิกเพื่อดูกราฟประวัติ KRI">'+
          '<td class="kg-k">'+(k.f && r.factors ? '<span class="kri-f" title="'+escAttr(r.factors[k.f-1].name)+'">ปัจจัย '+k.f+'</span>' : '')+esc(k.name)+(k.calc?'<div class="kri-calc">'+esc(k.calc)+'</div>':'')+'</td>'+
          '<td class="mono">'+esc(k.current)+mockTag(r, k.mock||k.mockTol)+'</td>'+
          '<td class="mono">'+esc(k.appetite)+'</td>'+
          '<td class="mono">'+esc(k.tolerance)+'</td>'+
          '<td><span class="kri-st">'+statusPill(k.status)+'<span class="kri-go" aria-hidden="true">'+icon("pulse")+'</span></span></td></tr>';
      }).join("");
      if(!rows) return '';
      var c=(r.objs||[])[0], t=OBJ_TIER[c];
      return '<tr class="kg-h" data-risk="'+r.id+'"><td colspan="5"><span class="kg-id mono">'+r.id+'</span>'+levelPill(r.level)+'<span class="kg-t">'+esc(r.title)+'</span>'+
        (t ? '<span class="kg-tier" title="'+escAttr(OBJ_TIER_NOTE[c]||TIERS[t].def)+'">'+tierBadge(c)+'<b class="mono">'+c+'</b> '+esc(TIERS[t].name)+'</span>' : '')+'</td></tr>'+rows;
    }).join("");
    var total = kriSt.length ? kriSt.reduce(function(a,st){ return a+(stCount[st]||0); },0) : totalAll;
    var allK=0; scopeRisks().forEach(function(r){ allK+=r.kris.length; });
    var kvT = '<div class="view-toggle"><button type="button" class="view-toggle-btn'+(kriView==="now"?' active':'')+'" data-kview="now">'+icon("table")+'สถานะปัจจุบัน</button>'+
      '<button type="button" class="view-toggle-btn'+(kriView==="month"?' active':'')+'" data-kview="month">'+icon("cal")+'รายเดือน</button></div>';
    var toolbar = '<div class="rf tb">'+
      tbRow('มุมมอง', kvT)+
      companyRow(function(id){ var n=0; scopeRisks().forEach(function(r){ if(r.sub===id) n+=r.kris.length; }); return n; })+
      tbRow('สถานะ', rkChip('st','ALL','ทั้งหมด',!kriSt.length)+ST.filter(function(t){ return t[0]!=="pending" || stCount.pending || inSel(kriSt,"pending") && kriSt.length; }).map(function(t){ return rkChip('st',t[0],'<i class="rs-sw '+({crit:'crit',watch:'watch',good:'good',pending:'na'})[t[0]]+'"></i>'+t[1],kriSt.indexOf(t[0])!==-1,stCount[t[0]]||0); }).join(''))+
      tbSum(total, allK, 'KRI', (activeFilter.length>0 && !lockedScope()) || kriSt.length>0)+'</div>';
    if(kriView==="month" && total) rowsHtml = kriMonthRows(list);
    var MN=HIST_MONTHS.slice(-6);
    var tblBody = total && kriView==="month" ? ('<div class="tbl-wrap"><table class="km-tbl"><thead><tr><th>Risk ID</th><th>KRI</th>'+MN.map(function(m){ return '<th class="km-m">'+m.label+'</th>'; }).join('')+'<th>Appetite · Tolerance</th></tr></thead>'+
      '<tbody>'+rowsHtml+'</tbody></table></div>'+
      '<div class="km-key"><span><i class="km-sw crit"></i>เกิน Tolerance</span><span><i class="km-sw watch"></i>เฝ้าระวัง</span><span><i class="km-sw good"></i>ปกติ</span><span>คลิกแถวเพื่อดูกราฟ</span></div>')
      : total ? ('<div class="tbl-wrap"><table class="kg-tbl"><thead><tr><th>KRI</th><th>ค่าปัจจุบัน</th><th>Appetite</th><th>Tolerance</th><th>สถานะ</th></tr></thead>'+
      '<tbody>'+rowsHtml+'</tbody></table></div>'+
      '<div class="hint" style="margin-top:10px;">คลิกแถวเพื่อเปิดกราฟประวัติของ KRI นั้น</div>')
      : emptyState('ไม่พบ KRI ตามตัวกรองนี้');

    return ''+
    '<div class="page-head"><div><h2>KRI Monitoring</h2><div class="sub">KRI คือสัญญาณล่วงหน้าว่าความเสี่ยงกำลังจะเกิด เทียบกับ Appetite และ Tolerance · ค่ายิ่งสูงยิ่งเสี่ยง · ผลลัพธ์ KPI ดูได้ในหน้า Objectives &amp; KPI</div></div>'+'</div>'+
    toolbar+
    '<div class="card">'+tblBody+'</div>'+
    renderRiskModal();
  }

  /* ---------------- RENDER: REGISTER DETAIL ---------------- */
  /* ---------------- INDICATOR HISTORY (risk modal) ----------------
     Simulated monthly series (18 months) until real data is connected. Quarterly = end-of-quarter snapshot. */
  var histSel = "kri:0", histPeriod = "m";
  var kbFactor = "ALL"; // KRI panel filter: "ALL" | 0 (ภาพรวม) | factor number — follows the factor opened on the left
  var HIST_MONTHS = (function(){
    var th=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."], out=[], y=2568, m=3;
    var A=PRC.ASOF||"2026-09-17", N=(+A.slice(0,4)-2025)*12+(+A.slice(5,7))-3;
    for(var i=0;i<N;i++){ out.push({label:th[m]+" "+String(y).slice(2), q:"Q"+(Math.floor(m/3)+1)+"/"+String(y).slice(2), qEnd:(m%3===2)}); m++; if(m>11){ m=0; y++; } }
    return out;
  })();
  function hNum(s){ if(!s) return null; var m=/(-?\d[\d,]*(?:\.\d+)?)/.exec(String(s)); return m ? parseFloat(m[1].replace(/,/g,"")) : null; }
  function hUnit(s){ var m=/-?\d[\d,]*(?:\.\d+)?\s*([^\s(]*(?:\s(?:บาท\/ตัน|ครั้ง\/ปี|ตัน\/ไร่|ตัน\/วัน|ลำ\/วัน|กล้า|คน|ราย|ครั้ง|เรื่อง|วัน|เท่า|โครงการ|ตำแหน่ง|รายการ|บริษัท|สัญญา\/ปี))?)/.exec(String(s||"")); return m ? m[1].replace(/^\//,"").trim() : ""; }
  function hSeed(str){ var h=2166136261; for(var i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); } return function(){ h+=0x6D2B79F5; var t=h; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
  function histModel(name, appStr, tolStr, curStr){
    var app=hNum(appStr), tol = app===null ? null : hNum(tolStr), cur=hNum(curStr);
    var unit=hUnit(appStr)||hUnit(curStr);
    var dir; // +1 higher is better, -1 lower is better
    if(app!==null && tol!==null && app!==tol) dir = app>tol ? 1 : -1;
    else if(/≤/.test(appStr||"")) dir=-1; else if(app===0) dir=-1; else dir=1;
    var rnd=hSeed(name), n=HIST_MONTHS.length, vals=[];
    var base = Math.abs(app!==null && app!==0 ? app : (cur||10));
    var span = (app!==null && tol!==null && app!==tol) ? Math.abs(app-tol) : (base>=5 ? Math.max(base*0.12,1) : base*0.3);
    var isCount = /^(ราย|ครั้ง|เรื่อง|โครงการ|ตำแหน่ง|รายการ|บริษัท|สัญญา)/.test(unit) || (app===0 && !unit);
    if(isCount && dir===-1){
      for(var i=0;i<n;i++) vals.push(rnd()<0.18 ? 1 : 0);
      if(cur!==null) vals[n-1]=cur;
    } else {
      var end = cur!==null ? cur : (app!==null ? app - dir*span*(rnd()*1.2-0.4) : 50);
      var start = end - dir*span*(0.8+rnd()*0.8);
      for(var j=0;j<n;j++){ var t=j/(n-1); vals.push(start+(end-start)*t + (rnd()-0.5)*span*0.35); }
      vals[n-1]=end;
      var pct = /%/.test(unit) && !/จุด/.test(unit);
      var dec = base<1 ? 1000 : base<10 ? 100 : 10;
      vals = vals.map(function(v){ if(pct) v=Math.max(0,Math.min(100,v)); if(app!==null && app>=0 && v<0) v=0; return Math.abs(v)>=100 ? Math.round(v) : Math.round(v*dec)/dec; });
    }
    return {app:app, tol:tol, dir:dir, unit:unit, vals:vals, hasCur:cur!==null, appStr:appStr, tolStr:tolStr, ok:(app!==null || cur!==null)};
  }
  function hStatus(md, v){
    if(md.app===null) return "pending";
    var ok = md.dir>0 ? v>=md.app : v<=md.app;
    if(ok) return "good";
    if(md.tol===null || md.tol===md.app) return "crit"; // no buffer between appetite and tolerance
    return (md.dir>0 ? v>=md.tol : v<=md.tol) ? "watch" : "crit";
  }
  function hFmt(v, unit){ var s = Math.abs(v)>=1000 ? v.toLocaleString("en-US") : String(v); return s+(unit ? (unit==="%"?"":" ")+unit : ""); }
  // Corporate KPI target -> threshold string (e.g. "≤40%"); null when the target has no number (e.g. "≥ เป้าที่ Board กำหนด")
  function kpiThreshold(target){
    var m=/(≥|≤|=|ไม่เกิน)\s*([+\-]?\s*\d[\d,]*(?:\.\d+)?)\s*(%|จุด%|บาท\/หุ้น|ครั้ง|ราย)?/.exec(target);
    if(!m) return null;
    var op = m[1]==="ไม่เกิน" ? "≤" : m[1];
    return op+m[2].replace(/\s/g,"")+(m[3] ? (m[3]==="%"?"":" ")+m[3] : "");
  }
  function histChartSvg(md, pts, isKpi){
    var W=640,H=230,L=52,R=110,T=14,B=30, iw=W-L-R, ih=H-T-B;
    var ys=pts.map(function(p){return p.v;}); if(md.app!==null) ys.push(md.app); if(md.tol!==null) ys.push(md.tol);
    var lo=Math.min.apply(null,ys), hi=Math.max.apply(null,ys); if(hi===lo){ hi+=1; lo=Math.max(0,lo-1); }
    var pad=(hi-lo)*0.12; lo=lo-pad; hi=hi+pad; if(Math.min.apply(null,ys)>=0 && lo<0) lo=0;
    var raw=(hi-lo)/4, mag=Math.pow(10,Math.floor(Math.log10(raw))), nrm=raw/mag, step=(nrm<=1?1:nrm<=2?2:nrm<=2.5?2.5:nrm<=5?5:10)*mag;
    lo=Math.floor(lo/step)*step; hi=Math.ceil(hi/step)*step; if(Math.min.apply(null,ys)>=0 && lo<0) lo=0;
    function x(i){ return L + (pts.length===1 ? iw/2 : i*iw/(pts.length-1)); }
    function y(v){ return T + ih - (v-lo)/(hi-lo)*ih; }
    var g='';
    for(var gv=lo; gv<=hi+step/2; gv+=step){ var gy=y(gv), lab=Math.round(gv/step)*step;
      lab = Math.abs(lab)>=1000 ? Math.round(lab).toLocaleString("en-US") : String(Math.round(lab*1000)/1000);
      g+='<line x1="'+L+'" x2="'+(L+iw)+'" y1="'+gy+'" y2="'+gy+'" class="hc-grid"/><text x="'+(L-6)+'" y="'+(gy+4)+'" class="hc-ax" text-anchor="end">'+lab+'</text>'; }
    function thr(v,cls,label){ if(v===null) return ''; var ty=y(v);
      return '<line x1="'+L+'" x2="'+(L+iw)+'" y1="'+ty+'" y2="'+ty+'" class="hc-thr '+cls+'"/><text x="'+(L+iw+8)+'" y="'+(ty+4)+'" class="hc-thl">'+label+'</text>'; }
    var bands='';
    if(!isKpi && md.dir<0 && md.app!==null){
      var ya=y(Math.min(Math.max(md.app,lo),hi)), yt = (md.tol!==null && md.tol>md.app) ? y(Math.min(md.tol,hi)) : ya;
      bands = '<rect x="'+L+'" y="'+ya+'" width="'+iw+'" height="'+Math.max(0,T+ih-ya)+'" class="hc-band ok"/>'+
        (yt<ya ? '<rect x="'+L+'" y="'+yt+'" width="'+iw+'" height="'+(ya-yt)+'" class="hc-band wt"/>' : '')+
        '<rect x="'+L+'" y="'+T+'" width="'+iw+'" height="'+Math.max(0,yt-T)+'" class="hc-band cr"/>';
    }
    var th = thr(md.app,'app',isKpi?'เป้าหมาย':'Appetite') + (md.tol!==null && md.tol!==md.app ? thr(md.tol,'tol','Tolerance') : '');
    var path = pts.map(function(p,i){ return (i?'L':'M')+x(i).toFixed(1)+' '+y(p.v).toFixed(1); }).join(' ');
    var dots = pts.map(function(p,i){
      return '<circle cx="'+x(i)+'" cy="'+y(p.v)+'" r="4.5" class="hc-pt '+p.st+'"/>'+
        '<circle cx="'+x(i)+'" cy="'+y(p.v)+'" r="13" class="hist-hit" data-tip="'+escAttr(p.label+' · '+hFmt(p.v,md.unit)+' · '+({good:'ผ่าน Appetite',watch:'เฝ้าระวัง',crit:'เกิน Tolerance',pending:'ไม่มีเกณฑ์'})[p.st])+'"/>';
    }).join('');
    var xs = pts.length>8 ? 2 : 1;
    var xl = pts.map(function(p,i){ return ((pts.length-1-i)%xs===0) ? '<text x="'+x(i)+'" y="'+(H-8)+'" class="hc-ax" text-anchor="middle">'+p.label+'</text>' : ''; }).join('');
    return '<svg viewBox="0 0 '+W+' '+H+'" class="hc-svg" role="img" aria-label="กราฟประวัติตัวชี้วัด">'+bands+g+th+'<path d="'+path+'" class="hc-line"/>'+dots+xl+'</svg>';
  }
  function histSectionHtml(r){
    var items = [];
    r.kris.forEach(function(k,i){ if(!kriHasHist(r,k)) return; items.push({key:"kri:"+i, label:k.name, calc:k.calc, st:k.status, k:k, md:function(){ return kriMd(r,k); }, kind:"KRI"}); });
    (r.kpis||[]).forEach(function(id){ var k=kpiById(id); if(!k) return;
      var thr=kpiThreshold(k.target); if(!thr) return; // no numeric target yet -> nothing to plot
      items.push({key:"kpi:"+id, label:id, md:function(){ var m=histModel(id, thr, "", "—"); m.appStr=thr; return m; }, kind:"KPI", full:k.target}); });
    if(!items.length) return '';
    var allItems = items;
    if(kbFactor!=="ALL"){ var fItems = items.filter(function(it){ return it.kind==="KRI" && (kbFactor==="CORE" ? it.k.core : (it.k.f||0)===kbFactor); }); if(fItems.length) items = fItems; else kbFactor="ALL"; }
    var sel = items.filter(function(it){ return it.key===histSel; })[0] || items[0];
    histSel = sel.key;
    // factor chips: same grouping as the accordion on the left
    function grpChip(fv, label, list, tip){
      if(!list.length) return '';
      var crit=list.some(function(it){ return it.kind==="KRI" && it.st==="crit"; }), on = kbFactor===fv;
      return '<button type="button" class="kb-f'+(on?' on':'')+'" aria-pressed="'+on+'" data-kbf="'+fv+'" data-hist="'+list[0].key+'"'+(tip?' title="'+escAttr(tip)+'"':'')+'>'+(crit?'<i class="kb-fd" title="มี KRI เกิน Tolerance"></i>':'')+label+'<span>'+list.length+'</span></button>';
    }
    var kriOnly = allItems.filter(function(it){ return it.kind==="KRI"; });
    var coreList = kriOnly.filter(function(it){ return it.k.core; });
    var fChips = '<div class="kb-fs">'+
      (coreList.length ? grpChip("CORE", 'KRI หลัก', coreList, 'KRI หลักที่รายงาน President และ RMC — ที่เหลือ PSL ติดตามภายในบริษัท') : '')+
      '<button type="button" class="kb-f'+(kbFactor==="ALL"?' on':'')+'" aria-pressed="'+(kbFactor==="ALL")+'" data-kbf="ALL" data-hist="'+histSel+'">ทั้งหมด<span>'+allItems.length+'</span></button>'+
      grpChip(0, 'ภาพรวม', kriOnly.filter(function(it){ return !(it.k.f); }))+
      r.factors.map(function(f,i){ return grpChip(i+1, 'ปัจจัย '+(i+1), kriOnly.filter(function(it){ return it.k.f===i+1; }), f.name); }).join('')+
    '</div>';
    var md = sel.md();
    var pts = histPeriod==="q"
      ? HIST_MONTHS.map(function(m,i){ return {m:m,v:md.vals[i]}; }).filter(function(o){ return o.m.qEnd; }).map(function(o){ return {label:o.m.q, v:o.v}; })
      : HIST_MONTHS.slice(-12).map(function(m,i){ return {label:m.label, v:md.vals[md.vals.length-12+i]}; });
    pts.forEach(function(p){ p.st = hStatus(md, p.v); });
    if(sel.kind==="KRI" && md.hasCur && sel.st && sel.st!=="pending") pts[pts.length-1].st = sel.st; // latest point follows the status recorded in the risk register
    var last=pts[pts.length-1], prev=pts[pts.length-2], delta = prev ? Math.round((last.v-prev.v)*1000)/1000 : 0;
    var better = delta===0 ? null : ((delta>0) === (md.dir>0));
    // KRI board: every indicator of this risk at a glance (status · 12-month trend · current value), grouped by factor; click a row to chart it
    function spark(it){
      var m=it.md(), v=m.vals.slice(-12), W=76, H=22, lo=Math.min.apply(null,v), hi=Math.max.apply(null,v);
      if(m.app!==null){ lo=Math.min(lo,m.app); hi=Math.max(hi,m.app); } if(hi===lo){ hi+=1; lo-=1; }
      function x(i){ return 2+i*(W-6)/(v.length-1); } function y(val){ return 3+(H-6)*(1-(val-lo)/(hi-lo)); }
      var st = it.kind==="KRI" ? (it.st||"pending") : hStatus(m, v[v.length-1]);
      return '<svg class="kb-spark" viewBox="0 0 '+W+' '+H+'" aria-hidden="true">'+
        (m.app!==null ? '<line x1="2" x2="'+(W-2)+'" y1="'+y(m.app).toFixed(1)+'" y2="'+y(m.app).toFixed(1)+'" class="kb-app"/>' : '')+
        '<polyline points="'+v.map(function(val,i){ return x(i).toFixed(1)+','+y(val).toFixed(1); }).join(' ')+'" class="kb-line"/>'+
        '<circle cx="'+x(v.length-1).toFixed(1)+'" cy="'+y(v[v.length-1]).toFixed(1)+'" r="2.6" class="kb-end '+st+'"/></svg>';
    }
    var ST_LBL={crit:"เกิน Tolerance",watch:"เฝ้าระวัง",good:"ปกติ",pending:"รอข้อมูล"};
    var stc={crit:0,watch:0,good:0,pending:0}; items.forEach(function(it){ if(it.kind==="KRI") stc[it.st]=(stc[it.st]||0)+1; });
    var chips = fChips+'<div class="kb">'+
      '<div class="kb-sum">'+["crit","watch","good","pending"].filter(function(k){ return k!=="pending" || stc[k]; }).map(function(k){ return '<span class="kb-s '+k+'"><i></i>'+ST_LBL[k]+' <b>'+stc[k]+'</b></span>'; }).join('')+'</div>'+
      '<div class="kb-head" aria-hidden="true"><span></span><span>KRI</span><span>แนวโน้ม</span><span>ปัจจุบัน</span><span>Appetite</span><span>Tolerance</span></div>'+
      '<div class="kb-list" role="listbox" aria-label="KRI ทั้งหมดของความเสี่ยงนี้ — เลือกเพื่อดูกราฟ">'+(function(){
        var out='';
        items.forEach(function(it){
          var st = it.kind==="KRI" ? it.st : "pending", on = it.key===sel.key;
          var val = it.kind==="KRI" ? (it.k.current && it.k.current!=="—" ? it.k.current : "—") : esc(kpiThreshold(it.full)||"");
          out+='<button type="button" class="kb-row'+(on?' on':'')+'" role="option" aria-selected="'+on+'" data-hist="'+it.key+'" title="'+escAttr((it.full||it.label)+' · '+(it.kind==="KRI"?ST_LBL[st]:'Corporate KPI'))+'">'+
            '<i class="kb-dot '+(it.kind==="KRI"?st:'kpi')+'" aria-hidden="true"></i>'+
            '<span class="kb-name">'+(it.kind==="KPI"?'<span class="hist-kind">KPI</span> ':'')+esc(it.kind==="KPI" ? it.label+' '+(it.full||'') : it.label)+(it.kind==="KRI" && it.k.core ? ' <span class="kri-core">หลัก</span>' : '')+(it.kind==="KRI" ? mockTag(r, it.k.mock||it.k.mockTol) : '')+'</span>'+
            spark(it)+'<span class="kb-val mono'+(val==="—"?' none':'')+'">'+esc(val)+'</span>'+
            (it.kind==="KRI" ? '<span class="kb-thr a mono">'+esc(it.k.appetite||"—")+'</span><span class="kb-thr t mono">'+esc(it.k.tolerance||"—")+'</span>' : '<span class="kb-thr a">เป้าหมาย</span><span class="kb-thr t"></span>')+
            '<span class="sr-only">'+(it.kind==="KRI"?ST_LBL[st]:'')+'</span></button>';
        });
        return out; })()+'</div>'+
    '</div>';
    var HST={good:'ผ่าน Appetite',watch:'เฝ้าระวัง',crit:'เกิน Tolerance',pending:'ไม่มีเกณฑ์'};
    var table = '<details class="hist-tbl-d"'+(histTblOpen?' open':'')+'><summary>ดูค่าเป็นตาราง</summary><div class="tbl-wrap"><table class="hist-tbl hist-v"><thead><tr><th>งวด</th><th>ค่า</th><th>สถานะ</th></tr></thead><tbody>'+
      pts.map(function(p, i){ return '<tr data-pt="'+i+'"><td>'+p.label+'</td><td class="mono">'+hFmt(p.v,md.unit)+'</td><td><i class="rp-dot '+({good:'good',watch:'watch',crit:'crit',pending:'na'})[p.st]+'"></i> '+HST[p.st]+'</td></tr>'; }).reverse().join('')+
      '</tbody></table></div></details>';
    return '<div class="hist" id="riskHist">'+
      '<div class="hist-top"><h4>ตัวชี้วัดความเสี่ยง (KRI)</h4><div class="hist-tools">'+kriBtnsHtml(r)+
        '<div class="view-toggle hist-per"><button type="button" class="view-toggle-btn'+(histPeriod==="m"?' active':'')+'" data-hper="m">'+icon("cal")+'รายเดือน</button><button type="button" class="view-toggle-btn'+(histPeriod==="q"?' active':'')+'" data-hper="q">'+icon("calq")+'รายไตรมาส</button></div></div></div>'+
      '<div class="hist-chips">'+chips+'</div>'+
      '<div class="hist-sum"><span class="hist-name">'+esc(sel.full||sel.label)+(sel.calc?'<span class="kri-calc">วิธีวัด: '+esc(sel.calc)+'</span>':'')+''+(sel.kind==="KRI"?'<span class="kri-calc">ค่ายิ่งสูง ยิ่งเสี่ยง — ต้องอยู่ต่ำกว่าเส้น Appetite</span>':'')+'</span>'+
        '<span class="hist-last"><b class="mono">'+hFmt(last.v,md.unit)+'</b> '+statusPill(last.st==="pending"?"pending":last.st)+
        (prev ? ' <span class="hist-delta '+(better===null?'':better?'up':'down')+'">'+(delta>0?'▲ +':delta<0?'▼ ':'')+(delta===0?'เท่าเดิม':hFmt(delta,md.unit))+' จาก'+(histPeriod==="q"?'ไตรมาส':'เดือน')+'ก่อน</span>' : '')+'</span>'+
        '<span class="hist-thr">'+(sel.kind==="KPI" ? 'เป้าหมาย '+esc(md.appStr) : 'Appetite '+esc(md.appStr||"—")+' · Tolerance '+esc(md.tolStr||"—"))+'</span></div>'+
      '<div class="hist-chart">'+histChartSvg(md, pts, sel.kind==="KPI")+'<div class="hist-tip" hidden></div></div>'+
      table+
      '<div class="hist-note">ข้อมูลจำลองเพื่อแสดงรูปแบบการติดตาม ยังไม่ใช่ข้อมูลจริง'+(sel.kind==="KRI" && md.hasCur ? ' · ค่าล่าสุดตรงกับค่าปัจจุบันในทะเบียน' : '')+' · รายไตรมาสใช้ค่า ณ สิ้นไตรมาส</div>'+
    '</div>';
  }
  function kriHasHist(r,k){ return kriMd(r,k).ok; }
  function renderRiskModal(){
    if(!selectedRisk) return '';
    var r=RISKS.filter(function(x){ return x.id===selectedRisk; })[0]; if(!r) return '';
    return '<div class="modal-backdrop" id="riskModalBackdrop"><div class="modal-box modal-wide">'+riskModalInner(r)+'</div></div>';
  }
  function riskModalInner(r){
    var card=riskCardHtml(r, true).replace('class="risk-card"','class="risk-card open"');
    var tabs='<div class="rm-tabs" role="tablist" aria-label="มุมมองความเสี่ยง">'+[["detail","รายละเอียด","shield"],["hist","ประวัติ","history"]].map(function(t){ var on=rmTab===t[0];
      return '<button type="button" role="tab" aria-selected="'+on+'" class="rm-tab'+(on?' on':'')+'" data-rmtab="'+t[0]+'">'+icon(t[2])+t[1]+'</button>'; }).join('')+'</div>';
    var i=card.indexOf('<div class="risk-body">');
    card = rmTab==="hist" ? card.slice(0,i)+tabs+'<div class="risk-body">'+riskHistoryHtml(r)+'</div></div>' : card.slice(0,i)+tabs+card.slice(i);
    return '<button type="button" class="modal-close" id="riskModalClose" aria-label="ปิด">&times;</button>'+card;
  }
  function rerenderRiskModal(scrollToHist){
    var box=document.querySelector('[id^="page-"]:not([hidden]) #riskModalBackdrop .modal-box'); var r=RISKS.filter(function(x){ return x.id===selectedRisk; })[0];
    if(!box || !r) return;
    var st=box.scrollTop, kl=box.querySelector(".kb-list"), kst=kl?kl.scrollTop:0;
    box.innerHTML=riskModalInner(r); box.scrollTop=st;
    var kl2=box.querySelector(".kb-list"); if(kl2){ kl2.scrollTop=kst; var onr=kl2.querySelector(".kb-row.on");
      if(onr && (onr.offsetTop < kl2.scrollTop || onr.offsetTop+onr.offsetHeight > kl2.scrollTop+kl2.clientHeight)) kl2.scrollTop = onr.offsetTop - 34; }
    if(scrollToHist){ var h=document.getElementById("riskHist"); if(h) h.scrollIntoView({block:"nearest", behavior:"smooth"}); }
  }

  var factorOpen = {}; // "RISKID:index" -> bool; first factor open by default
  function factorAlert(r,i){ return r.kris.some(function(k){ return k.f===i+1 && (k.status==="crit" || k.status==="watch"); }); }
  function factorIsOpen(r,i){
    var k=r.id+":"+i; if(k in factorOpen) return factorOpen[k];
    var any=r.factors.some(function(f,j){ return factorAlert(r,j); });
    return any ? factorAlert(r,i) : i===0;
  }
  /* actions sit with the section they change: KRI buttons in the KRI header, treatment in its header, Audit Trail with the whole risk */
  function kriBtnsHtml(r){
    if(!currentUser) return '';
    var b=[];
    if(can("อัปเดตค่า KRI รายเดือน + แนบหลักฐาน", r)) b.push('<button type="button" class="ra-btn sm primary" data-kri-upd="'+r.id+'">'+icon("upload")+'อัปเดตค่า KRI</button>');
    return b.join('');
  }
  function actBtnHtml(r){
    return (currentUser && can("แก้ไขสาเหตุและแนวทางจัดการ", r)) ? '<button type="button" class="ra-btn sm" data-act-edit="'+r.id+'">'+icon("edit")+'แก้ไขสาเหตุและแนวทางจัดการ</button>' : '';
  }
  function riskActionsHtml(r){
    if(!currentUser) return '';
    var edit = can("อัปเดตค่า KRI รายเดือน + แนบหลักฐาน", r) || can("ตรวจค่า KRI ก่อนส่งส่วนกลาง", r) || can("แก้ไขสาเหตุและแนวทางจัดการ", r);
    var fp=flowPill(r), cf=can("ตรวจค่า KRI ก่อนส่งส่วนกลาง", r) ? '<button type="button" class="ra-btn sm'+(flowOf(r).state==="submitted"?' primary':'')+'" data-kri-cf="'+r.id+'">'+icon("check")+'ตรวจรายงานประจำเดือน</button>' : '';
    if(!fp && !cf && edit) return '';
    return '<div class="rm-actions">'+fp+cf+(edit?'':'<span class="ra-ro">'+icon("eye")+'ดูอย่างเดียว</span>')+'</div>';
  }
  /* ---- risk treatment tracking (แนวทางจัดการ): status, due date, owner, monthly log ---- */
  var ASOF = PRC.ASOF || "2026-09-17";
  var TH_MON = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  function thDate(iso){ var y=+iso.slice(0,4), m=+iso.slice(5,7), d=+iso.slice(8,10); return d+" "+TH_MON[m-1]+" "+String(y+543).slice(2); }
  function asofFull(){ return +ASOF.slice(8,10)+" "+TH_MON[+ASOF.slice(5,7)-1]+" "+(+ASOF.slice(0,4)+543); }
  function dayDiff(a,b){ return Math.round((Date.parse(a)-Date.parse(b))/864e5); }
  function actState(a){ if(a.status==="done") return "done"; if(a.due<ASOF) return "late"; return a.status==="todo" ? "todo" : "doing"; }
  var ACT_LBL = {done:"เสร็จ", doing:"กำลังทำ", todo:"ยังไม่เริ่ม", late:"ล่าช้า"};
  function factorCrit(r, fi){ return r.kris.some(function(k){ return (k.f||0)===fi+1 && k.status==="crit"; }); }
  function actHtml(r, f, fi, ai){
    var a=(f.acts||[])[ai], txt=f.responses[ai]; if(!a) return '<li>'+esc(txt)+'</li>';
    var st=actState(a), log=a.log||[], last=log[log.length-1];
    var pill='<span class="act-st '+st+'">'+(st==="late" ? 'ล่าช้า '+dayDiff(ASOF,a.due)+' วัน' : ACT_LBL[st]+(st==="doing" && a.pct ? ' '+a.pct+'%' : ''))+'</span>';
    var warn=(st==="done" && factorCrit(r,fi)) ? '<div class="act-warn">เสร็จแล้ว แต่ KRI ของปัจจัยนี้ยังเกิน Tolerance</div>' : '';
    var hist=log.length>1 ? '<details class="act-h"><summary>ประวัติ '+log.length+' ครั้ง</summary><ol>'+log.slice().reverse().map(function(u){ return '<li><b>'+thDate(u.d)+'</b> '+esc(u.note)+'</li>'; }).join('')+'</ol></details>' : '';
    return '<li class="act '+st+'"><div class="act-t">'+esc(txt)+'</div>'+
      '<div class="act-m">'+pill+'<span>กำหนด '+thDate(a.due)+'</span>'+(a.owner?'<span>'+esc(a.owner)+'</span>':'')+
        (last ? '<span class="act-u">อัปเดต '+thDate(last.d)+' · '+esc(last.note)+'</span>' : '')+'</div>'+hist+warn+'</li>';
  }
  function actLateHtml(f){ var n=(f.acts||[]).filter(function(a){ return actState(a)==="late"; }).length; return n ? '<span class="rfx-st late"><i></i>แนวทางล่าช้า '+n+'</span>' : ''; }
  function actSummaryCard(list){
    var c={done:0,doing:0,todo:0,late:0}, lateList=[], ineff=0;
    list.forEach(function(r){ r.factors.forEach(function(f,fi){ (f.acts||[]).forEach(function(a,ai){
      var st=actState(a); c[st]++;
      if(st==="late") lateList.push({r:r, a:a, t:f.responses[ai], d:dayDiff(ASOF,a.due)});
      if(st==="done" && factorCrit(r,fi)) ineff++;
    }); }); });
    var tot=c.done+c.doing+c.todo+c.late; if(!tot) return '';
    var K=["done","doing","todo","late"];
    var seg=K.map(function(k){ return c[k] ? '<span class="ab-seg '+k+'" style="flex:'+c[k]+'" title="'+ACT_LBL[k]+' '+c[k]+'"></span>' : ''; }).join('');
    var leg=K.map(function(k){ return '<span class="ab-k"><i class="'+k+'"></i>'+ACT_LBL[k]+' <b>'+c[k]+'</b></span>'; }).join('');
    lateList.sort(function(x,y){ return y.d-x.d; });
    var rows=lateList.slice(0,8).map(function(o){ return '<tr class="rs-row" data-risk="'+o.r.id+'" title="คลิกเพื่อดูความเสี่ยง"><td class="mono rg-id">'+o.r.id+'</td><td>'+esc(o.t)+'</td><td>'+esc(o.a.owner||'')+'</td><td class="mono">'+thDate(o.a.due)+'</td><td class="mono act-late-d">'+o.d+' วัน</td></tr>'; }).join('');
    return '<div class="card act-card"><div class="card-head"><h3>ความคืบหน้าแนวทางจัดการ ('+tot+' ข้อ)</h3><span class="act-asof">ณ '+thDate(ASOF)+'</span></div>'+
      '<div class="ab-bar" role="img" aria-label="'+K.map(function(k){ return ACT_LBL[k]+' '+c[k]; }).join(' · ')+'">'+seg+'</div>'+
      '<div class="ab-leg">'+leg+(ineff ? '<span class="ab-k warn">เสร็จแล้วแต่ KRI ยังเกิน Tolerance <b>'+ineff+'</b></span>' : '')+'</div>'+
      (rows ? '<div class="rf-lbl" style="margin-top:16px;">ล่าช้า · เรียงตามจำนวนวันที่เลยกำหนด</div><div class="tbl-wrap"><table class="act-tbl"><thead><tr><th>ความเสี่ยง</th><th>แนวทางจัดการ</th><th>ผู้รับผิดชอบ</th><th>กำหนด</th><th>เลยกำหนด</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
        (lateList.length>8 ? '<div class="hint" style="margin-top:6px;">และอีก '+(lateList.length-8)+' ข้อ</div>' : '') : '')+
    '</div>';
  }
  function objBlockHtml(r){ var o=String(r.objective||"").trim(); if(!o) return '';
    var i=o.indexOf(" — "), lines=(i>=0?o.slice(0,i):o).split(" · "), tg=i>=0?o.slice(i+3).split(" · "):[];
    function chip(c){ return '<span class="obj2-c mono">'+esc(c)+'</span>'; }
    var hasCode=lines.every(function(h){ return /^[A-Z]\d\s/.test(h); });
    var heads = hasCode ? lines.map(function(h){ var m=/^([A-Z]\d)\s+(.*)$/.exec(h); return '<div class="obj2-t">'+chip(m[1])+'<span>'+esc(m[2])+'</span></div>'; }).join('')
      : '<div class="obj2-t">'+(r.objs||[]).map(chip).join('')+'<span>'+esc(lines.join(' · '))+'</span></div>';
    var rows='';
    if(tg.length) rows+='<div class="obj2-dt">เป้าหมาย</div><ul class="obj2-dd">'+tg.map(function(t){ return '<li>'+esc(t)+'</li>'; }).join('')+'</ul>';
    if(r.kpiOut && r.kpiOut.length) rows+='<div class="obj2-dt">ผล KPI ล่าสุด · '+PERIOD+'</div><ul class="obj2-dd">'+r.kpiOut.map(function(k){ var R={crit:["crit","พลาดเป้า"],watch:["watch","พลาดเป้าเล็กน้อย"],good:["good","ถึงเป้า"]}[k.status]||["pending","รอข้อมูล"], kd=kpiById(k.kpi);
        return '<li><span class="obj2-kid mono" title="'+escAttr(kd?kd.target:k.kpi)+'">'+esc(k.kpi)+'</span><span>'+esc(k.name)+'</span><b class="mono">'+esc(k.current)+'</b><span class="pill '+R[0]+'">'+R[1]+'</span></li>'; }).join('')+'</ul>';
    return '<div class="obj2"><div class="obj2-h">'+icon("target")+'เป้าหมายกลยุทธ์ที่เชื่อมโยง</div>'+heads+(rows?'<div class="obj2-body">'+rows+'</div>':'')+'</div>'; }
  function riskCardHtml(r, inModal){
    function krisOf(fn){ var out=[]; r.kris.forEach(function(k,ki){ if((k.f||0)===fn) out.push([k,ki]); }); return out; }
    function stSummary(pairs){
      var c={crit:0,watch:0}; pairs.forEach(function(p){ if(c[p[0].status]!==undefined) c[p[0].status]++; });
      return (c.crit?'<span class="rfx-st crit"><i></i>เกิน Tolerance '+c.crit+'</span>':'')+(c.watch?'<span class="rfx-st watch"><i></i>เฝ้าระวัง '+c.watch+'</span>':'');
    }
    function causeTree(f, i){
      function actsOf(test){ var out=''; f.responses.forEach(function(t, ai){ if(test((f.acts||[])[ai]||{})) out+=actHtml(r, f, i, ai); }); return out; }
      var orph=actsOf(function(a){ return a.c==null || !f.causes[a.c]; });
      return '<div class="rf-tree">'+f.causes.map(function(c, ci){ var acts=actsOf(function(a){ return a.c===ci; });
          return '<div class="rf-cz"><div class="rf-cause"><span class="rf-ctag">สาเหตุ '+(i+1)+'.'+(ci+1)+'</span><span>'+esc(c)+'</span></div>'+
            (acts ? '<ul class="rf-ul rf-acts">'+acts+'</ul>' : '<div class="rf-none">ยังไม่มีแนวทางจัดการ</div>')+'</div>'; }).join('')+
        (orph ? '<div class="rf-cz"><div class="rf-cause o"><span class="rf-ctag">ยังไม่ระบุสาเหตุ</span></div><ul class="rf-ul rf-acts">'+orph+'</ul></div>' : '')+'</div>';
    }
    var bodyCR = (function(){
          var allOpen = r.factors.every(function(f,i){ return factorIsOpen(r,i); });
          return '<div class="rfx-top"><h4 style="font-size:14px;color:var(--brand-700);margin:0;">ปัจจัยเสี่ยงและแนวทางจัดการ ('+r.factors.length+' ปัจจัย)<span class="rfx-4t" title="กลยุทธ์ตอบสนองความเสี่ยง (4T)">4T: '+esc(r.response)+'</span></h4>'+
            (inModal ? '<div class="rfx-tools">'+actBtnHtml(r)+'<button type="button" class="rfx-all" data-fall="'+(allOpen?'close':'open')+'" data-rid="'+r.id+'">'+(allOpen?'ย่อทั้งหมด':'ขยายทั้งหมด')+'</button></div>' : '')+'</div>'+
          '<div class="rf-list">'+r.factors.map(function(f,i){
            var fk=krisOf(i+1), nK=fk.length;
            return '<details class="rfx'+(inModal && kbFactor===i+1?' active':'')+'" data-fkey="'+r.id+':'+i+'"'+(factorIsOpen(r,i)?' open':'')+'>'+
              '<summary class="rfx-h"><span class="rf-no">'+(i+1)+'</span><span class="rfx-name">'+esc(f.name)+
                '<span class="rfx-meta">'+f.causes.length+' สาเหตุ · '+f.responses.length+' แนวทางจัดการ'+(nK?' · '+nK+' KRI':'')+stSummary(fk)+actLateHtml(f)+'</span></span>'+icon("chevd","rfx-chev")+'</summary>'+
              causeTree(f, i)+
              '</details>'; }).join('')+'</div>';
        })();
    var objChips = (r.objs||[]).map(function(c){ return '<span class="rg-obj mono">'+c+'</span>'; }).join('');
    return '<div class="risk-card" data-sub="'+r.sub+'">'+
      '<div class="risk-head">'+
        '<span class="rid">'+r.id+'</span>'+levelPill(r.level)+
        '<span class="rtitle">'+esc(r.title)+exampleTag(r)+'</span>'+
        '<span class="rmeta">'+subName(r.sub)+' · '+esc(r.cat)+' · L'+r.L+'×I'+r.I+'</span>'+
        '<span class="chev">&#9656;</span>'+
      '</div>'+
      '<div class="risk-body">'+(inModal ? riskActionsHtml(r)+levelPathHtml(r)+'<div class="rm-grid"><div class="rm-main">' : '')+
        objBlockHtml(r)+
        (rmcNoteOf(r) ? '<div class="rmc-note"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3h9l3 3v11H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 9h6M7 12h6M7 15h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span>'+esc(rmcNoteOf(r))+'</span></div>' : '')+
        '<div class="risk-gov">'+
          (objChips ? '<div><span class="rg-h">Strategic Objective</span>'+objChips+'</div>' : '')+
          (r.kpis ? '<div><span class="rg-h">Corporate KPI ที่เกี่ยวข้อง</span>'+r.kpis.map(function(id){ var k=kpiById(id); return '<span class="rg-kpi mono" title="'+escAttr(k?k.target:id)+'">'+id+'</span>'; }).join('')+'</div>' : '')+
          (r.parent ? '<div><span class="rg-h">ส่งผลต่อความเสี่ยงระดับกลุ่ม</span><button type="button" class="rg-link mono" data-risk="'+r.parent+'">'+r.parent+'</button></div>' : '')+
          (function(){ var ch=RISKS.filter(function(c){ return c.parent===r.id; }); return ch.length ? '<div><span class="rg-h">ความเสี่ยงระดับบริษัทที่ส่งผล</span>'+ch.map(function(c){ return '<button type="button" class="rg-link mono" data-risk="'+c.id+'">'+c.id+'</button>'; }).join('')+'</div>' : ''; })()+
          (r.owner ? '<div><span class="rg-h">Risk Owner</span>'+esc(r.owner)+mockTag(r, r.ownerMock)+'</div>' : '')+
          (r.forum ? '<div><span class="rg-h">ติดตามใน</span>'+esc(r.forum)+'</div>' : '')+
        '</div>'+
        bodyCR+
        (inModal ? '</div><div class="rm-side">'+histSectionHtml(r)+'</div></div>' : '')+
      '</div>'+
    '</div>';
  }
  function risksForObjective(list, code){
    return {
      primary: list.filter(function(r){ return r.objs && r.objs[0]===code; }),
      related: list.filter(function(r){ return r.objs && r.objs.indexOf(code)>0; })
    };
  }
  function levelTally(rs){
    var order=["สูงมาก","สูง","ปานกลาง","ต่ำ"], c={};
    rs.forEach(function(r){ c[r.level]=(c[r.level]||0)+1; });
    return order.filter(function(l){ return c[l]; }).map(function(l){ return '<span class="pill '+LEVEL_META[l].cls+'">'+l+' '+c[l]+'</span>'; }).join(' ');
  }
  function riskScore(r){ return r.L*r.I; }
  function renderProfileByObjective(list){
    var domains = registerDomains();
    var nObj=0, gaps=[];
    var body = domains.map(function(d){
      var rows = d.objs.map(function(o){
        nObj++;
        var g = risksForObjective(list, o.code);
        var all = g.primary.concat(g.related);
        if(!all.length) gaps.push(o.code);
        var kpis = o.corp.map(function(k){ return '<div class="rp-k"><span class="rp-kid mono">'+k.id+'</span><span class="rp-kt">'+esc(k.target)+'</span></div>'; }).join('');
        function line(r, rel){
          return '<button type="button" class="rp-risk'+(rel?' rel':'')+'" data-risk="'+r.id+'">'+
            '<i class="rp-dot '+LEVEL_META[r.level].cls+'" title="'+r.level+'"></i>'+
            '<span class="rp-id mono">'+r.id+'</span>'+
            '<span class="rp-t">'+esc(r.title)+(rel?' <em>(เกี่ยวข้อง)</em>':'')+exampleTag(r)+'</span>'+
          '</button>';
        }
        var primIds = g.primary.map(function(r){ return r.id; });
        function isNested(r){ return r.parent && primIds.indexOf(r.parent)!==-1; } // nest under its group risk only when that group risk is listed here as primary
        function kids(r){ return g.primary.filter(function(c){ return c.parent===r.id; }).sort(function(a,b){ return riskScore(b)-riskScore(a); }); }
        var lines = g.primary.filter(function(r){ return !isNested(r); }).sort(function(a,b){ return riskScore(b)-riskScore(a); }).map(function(r){
                      var ch = kids(r);
                      return line(r,false) + (ch.length ? '<div class="rp-kids">'+ch.map(function(c){ return line(c,false); }).join('')+'</div>' : '');
                    }).join('')+
                    g.related.filter(function(r){ return !isNested(r); }).map(function(r){ return line(r,true); }).join('');
        return '<div class="rp-row" id="po-'+o.code+'">'+
          '<div class="rp-obj"><span class="cm-oc mono">'+o.code+'</span><span class="cm-ot">'+esc(o.title)+' '+tierBadge(o.code)+'</span></div>'+
          '<div class="rp-kpi">'+kpis+'</div>'+
          '<div class="rp-list">'+(lines || '<span class="rp-gap">ยังไม่มีความเสี่ยงที่ระบุ</span>')+'</div>'+
        '</div>';
      }).join('');
      return '<div class="rp-domain" style="--dc:'+d.p.color+';">'+
        '<div class="cm-dhead"><span class="persp-chip" style="background:'+d.p.color+';">'+d.p.code+'</span><span class="cm-dname">'+esc(d.p.name)+'</span></div>'+
        '<div class="rp-rows">'+rows+'</div>'+
      '</div>';
    }).join('');
    var head = '<div class="rp-head"><div class="cm-h">Domain</div><div class="rp-cols">'+
      '<div class="cm-h">Objective</div><div class="cm-h">Corporate KPI</div><div class="cm-h">ประเด็นความเสี่ยง</div></div></div>';
    var summary = '<div class="po-sum">ความเสี่ยงครอบคลุม <b>'+(nObj-gaps.length)+'</b> จาก '+nObj+' Strategic Objective'+
      (gaps.length ? ' · <span class="po-gap">ยังไม่มีความเสี่ยงที่ระบุ: '+gaps.join(', ')+'</span>' : '')+
      ' · คลิกที่ประเด็นเพื่อดูรายละเอียด'+
      '<span class="rp-legend"><span><i class="rp-dot crit"></i>สูงมาก</span><span><i class="rp-dot high"></i>สูง</span><span><i class="rp-dot watch"></i>ปานกลาง</span><span><i class="rp-dot good"></i>ต่ำ</span></span></div>';
    return '<div class="card">'+summary+'<div class="rp">'+head+body+'</div></div>';
  }

  /* ---------------- RENDER: RISK PROFILE ---------------- */
  function riskQMatch(r){ if(!riskQ) return true; var q=riskQ.toLowerCase();
    return [r.id, r.title, r.owner||"", r.sub].concat(r.factors.map(function(f){ return f.name; })).some(function(t){ return String(t).toLowerCase().indexOf(q)!==-1; }); }
  function renderDetail(){
    var coList=filteredRisks().filter(riskQMatch);
    function okLvl(r){ return inSel(riskLvl, r.level); }
    function okObj(r){ return !riskObjs.length || (r.objs||[]).some(function(c){ return riskObjs.indexOf(c)!==-1; }); }
    function okCell(r){ return !regCell || (r.L+"-"+r.I)===regCell; }
    var list=coList.filter(function(r){ return okLvl(r) && okObj(r) && okCell(r); });
    var cnt={"สูงมาก":0,"สูง":0,"ปานกลาง":0,"ต่ำ":0};
    coList.filter(function(r){ return okObj(r) && okCell(r); }).forEach(function(r){ cnt[r.level]++; });
    var forObj=coList.filter(function(r){ return okLvl(r) && okCell(r); });
    var cl = regCell ? regCell.split("-") : null;
    var allObj=[]; registerDomains().forEach(function(d){ d.objs.forEach(function(o){ allObj.push(o.code); }); });
    var tierChips = [1,2,3].map(function(t){ var codes=allObj.filter(function(c){ return OBJ_TIER[c]===t; }); if(!codes.length) return '';
      var on=codes.every(function(c){ return riskObjs.indexOf(c)!==-1; }), n=forObj.filter(function(r){ return (r.objs||[]).some(function(c){ return codes.indexOf(c)!==-1; }); }).length;
      return '<button type="button" class="rf-chip rf-tier'+(on?' on':'')+'" data-rk="tier" data-val="'+t+'" aria-pressed="'+on+'" title="Tier '+t+': '+codes.join(', ')+'">T'+t+'<span class="rf-n">'+n+'</span></button>'; }).join('');
    var objChips = rkChip('obj','ALL','ทั้งหมด',!riskObjs.length)+tierChips+'<span class="rf-sep" aria-hidden="true"></span>'+registerDomains().map(function(d){ return d.objs.map(function(o){
        var n=forObj.filter(function(r){ return (r.objs||[]).indexOf(o.code)!==-1; }).length, on=riskObjs.indexOf(o.code)!==-1;
        return '<button type="button" class="rf-chip rf-obj'+(on?' on':'')+'" data-rk="obj" data-val="'+o.code+'" aria-pressed="'+on+'" title="'+escAttr(o.code+' '+o.title)+'"><i class="rf-dom" style="background:'+d.p.color+'"></i><span class="mono">'+o.code+'</span><span class="rf-n">'+n+'</span></button>'; }).join(''); }).join('');
    var active=(activeFilter.length>0 && !lockedScope()) || riskLvl.length>0 || riskObjs.length>0 || !!riskQ || !!regCell;
    var toolbar = '<div class="rf tb">'+
      tbRow('ค้นหา', '<label class="rf-search">'+icon("search")+'<span class="sr-only">ค้นหาความเสี่ยง</span><input type="search" id="riskQ" value="'+escAttr(riskQ)+'" placeholder="ค้นหาชื่อความเสี่ยง หรือ Risk Owner" autocomplete="off"></label>')+
      companyRow(function(id){ return scopeRisks().filter(function(r){ return r.sub===id; }).length; })+
      tbRow('ระดับ', rkChip('lvl','ALL','ทั้งหมด',!riskLvl.length && !regCell)+["สูงมาก","สูง","ปานกลาง","ต่ำ"].map(function(l){ return rkChip('lvl',l,'<i class="rs-sw '+LVL_CLS[l]+'"></i>'+l,riskLvl.indexOf(l)!==-1,cnt[l]); }).join('')+
        (regCell ? '<span class="pf-chip">Heat Map L'+cl[0]+' × I'+cl[1]+'<button type="button" data-cell-clear="1" aria-label="ล้างตัวกรอง Heat Map">&times;</button></span>' : ''))+
      tbRow('Objective', objChips)+
      (riskObjs.length ? '<div class="rf-objdesc">'+registerDomains().map(function(d){ return d.objs.filter(function(o){ return riskObjs.indexOf(o.code)!==-1; }).map(function(o){
          return '<div class="rf-od"><i class="rf-dom" style="background:'+d.p.color+'"></i><b class="mono">'+o.code+'</b><span>'+esc(o.title)+' '+tierBadge(o.code)+(OBJ_TIER_NOTE[o.code]?'<span class="rf-why">'+esc(OBJ_TIER_NOTE[o.code])+'</span>':'')+'</span></div>'; }).join(''); }).join('')+'</div>' : '')+
      tbSum(list.length, scopeRisks().length, 'ประเด็นความเสี่ยง', active)+'</div>';
    var body;
    if(!list.length) body = emptyState('ไม่พบประเด็นความเสี่ยงตามตัวกรองนี้');
    else {
      body = '<div class="card">'+
        registerTableHtml(list)+'<div class="hint" style="margin-top:10px;">เรียงตามคะแนน L×I จากสูงไปต่ำ · คลิกแถวเพื่อดูสาเหตุ แนวทางจัดการ KRI และกราฟประวัติ</div></div>';
    }

    return ''+
    '<div class="page-head"><div><h2>Risk Register</h2><div class="sub">ทะเบียนความเสี่ยงที่อาจทำให้ไม่บรรลุ Strategic Objective และ Corporate KPI — คลิกที่ความเสี่ยงเพื่อดูสาเหตุ แนวทางจัดการ และ KRI</div></div>'+'</div>'+
    toolbar+
    '<div class="panel" id="riskCards">'+body+'</div>'+
    renderRiskModal();
  }

  /* ---------------- RENDER: REPORT DRAFT ---------------- */
  function renderReport(){
    var critList = [];
    RISKS.forEach(function(r){ r.kris.forEach(function(k){ if(k.status==="crit") critList.push(r.id+" — "+k.name+" ("+k.current+" เทียบ Tolerance "+k.tolerance+")"); }); });
    var critHtml = critList.map(function(c){return '<li>'+esc(c)+'</li>';}).join("");

    return ''+
    '<div class="page-head"><div><h2>ร่างรายงาน RMC (จัดทำโดย AI Agent)</h2><div class="sub">ตัวอย่างร่างรายงานก่อนนำเข้าที่ประชุม RMC — Risk Owner ตรวจทานและแก้ไขก่อนเผยแพร่จริงเสมอ</div></div></div>'+
    '<div class="report">'+
      '<div class="report-bar"><span>รายงานความเสี่ยงองค์กร — ไตรมาส 3/2569 · ร่างโดย AI Agent เมื่อ 22 ก.ย. 2569</span><span class="draft">DRAFT — รอ Risk Owner ตรวจทาน</span></div>'+
      '<div class="report-body">'+
        '<h4>1. สถานะและแนวโน้มความเสี่ยง</h4>'+
        '<p>ภาพรวมกลุ่มมีความเสี่ยงที่เปิดติดตามอยู่ 7 ประเด็น แบ่งเป็นระดับสูงมาก 4 ประเด็น (ทั้งหมดอยู่ที่ PSL) และระดับสูง 2 ประเด็น กับปานกลาง 1 ประเด็น (PEM) ความเสี่ยงกระจุกตัวชัดเจนที่ PSL จากความพร้อมของกำลังการผลิตและการจัดหาวัตถุดิบไผ่ ซึ่งเป็นสาเหตุร่วมกันของ 3 ใน 4 ประเด็น</p>'+
        '<h4>2. KRI เทียบ Appetite และ Tolerance</h4>'+
        '<p>พบ KRI ที่เกิน Tolerance แล้ว '+critList.length+' รายการ ทั้งหมดอยู่ที่ PSL:</p>'+
        '<ul>'+critHtml+'</ul>'+
        '<p>PEM ยังไม่มี KRI ที่เชื่อมข้อมูล real-time เข้าระบบ (9 จาก 9 ตัวชี้วัด) จึงยังประเมินสถานะเชิงปริมาณไม่ได้ในรอบนี้ — ควรเร่งกำหนด Data Owner ตามที่ระบุไว้ในความเสี่ยงเรื่อง Odoo ERP</p>'+
        '<h4>3. ความคืบหน้า Risk Treatment Plan</h4>'+
        '<p>PSL อยู่ระหว่างจัดหาผู้รับเหมาตัด-ขนส่งไผ่ และเร่งสรรหาบุคลากรเพิ่ม 33 คน รองรับ 3 กะ ส่วน PEM อยู่ระหว่างแต่งตั้ง Committee และ Project Manager สำหรับโครงการ Odoo ERP</p>'+
        '<h4>4. อุปสรรคและประเด็นที่ต้องตัดสินใจ</h4>'+
        '<p>ต้นทุนจัดหาไผ่ของ PSL สูงกว่าเป้าหมายอย่างมีนัยสำคัญ (ค่าแรง+ค่าขนส่งรวมสูงกว่าเป้า 5 เท่า) อาจกระทบอัตรากำไรขั้นต้นของบริษัทในปีนี้ — เสนอที่ประชุมพิจารณาอนุมัติงบจัดหาผู้รับเหมาเร่งด่วน</p>'+
        '<h4>5. Risk Incident และ Emerging Risk</h4>'+
        '<p>ยังไม่พบ Risk Incident ในรอบนี้ · Emerging Risk ที่ Agent ตรวจพบจากแนวโน้มข้อมูล: ความเสี่ยงด้านคุณภาพข้อมูล (Data Quality) จากการที่หลายบริษัทย่อยยังไม่มีระบบรายงาน KRI แบบ real-time</p>'+
      '</div>'+
    '</div>';
  }

  /* ---------------- APP ---------------- */
  /* ---------------- ICONS (inline SVG, stroke = currentColor) ---------------- */
  var IC_PATHS = {
    plus:'<path d="M12 5v14M5 12h14"/>',
    trash:'<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
    list:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
    table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 15h18M9 9.5V20"/>',
    tree:'<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
    cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    calq:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 10v11M3 15.5h18"/>',
    heat:'<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" fill-opacity=".35"/><rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor" fill-opacity=".35"/><rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor"/>',
    shield:'<path d="M12 3l8 3v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z"/><path d="M12 8v4.5M12 15.5v.5"/>',
    pulse:'<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
    flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
    lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1.2-3.5 3.6-5.2 6.5-5.2s5.3 1.7 6.5 5.2"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M17.5 14.9c2 .6 3.3 2.2 4 5.1"/>',
    gavel:'<path d="M14 4l6 6M11.5 6.5l6 6M13 5l-5 5 6 6 5-5M8 10l-5 5 1.5 1.5L10 12"/><path d="M13 21h8"/>',
    crown:'<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    building:'<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
    clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
    check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    download:'<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    upload:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    logout:'<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l5-5-5-5M15 12H4"/>',
    swap:'<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    sso:'<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V8a5 5 0 0 1 10 0v3"/><circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none"/>',
    dash:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>',
    chevd:'<path d="M6 9l6 6 6-6"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    layers:'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'
  };
  function icon(n, cls){ return '<svg class="ic'+(cls?' '+cls:'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(IC_PATHS[n]||'')+'</svg>'; }

  // Official Precise logos (company CI) — used as supplied: never recoloured, cropped or redrawn
  var LOGO_V = "img/logo-v.png";
  /* ---------------- LOGIN & ROLES (prototype: no real authentication) ---------------- */
  var ROLES = PRC.ROLES;
  var ROLE_ORDER = PRC.ROLE_ORDER;
  var DEMO_USERS = PRC.DEMO_USERS;
  // capability matrix: y = allowed · own = risks/companies assigned (coordinator) · mine = risks owned (owner) · other text = informational step, not a system action
  var PERMS = PRC.PERMS;
  var currentUser = null, userMenuOpen = false;
  function lockedScope(){ return currentUser && currentUser.scope!=="ALL" ? currentUser.scope : null; }
  function roleOf(u){ return ROLES[(u||currentUser||{}).role] || {}; }
  function can(cap, r){
    if(!currentUser) return false; var v = PERMS.filter(function(p){ return p.cap===cap; })[0]; if(!v) return false; v = v[currentUser.role];
    if(v==="y") return true;
    if(v==="own") return !r || currentUser.scope==="ALL" || r.sub===currentUser.scope;
    if(v==="mine") return !r || (currentUser.risks||[]).indexOf(r.id)!==-1;
    return false;
  }
  function avatarHtml(u){ return '<span class="avatar" style="background:'+roleOf(u).color+'">'+esc(u.initials)+'</span>'; }
  function renderLogin(){
    var el=document.getElementById("login");
    el.innerHTML =
      '<div class="login-side">'+
        '<div class="lg-brand"><span class="logo-plate lg"><img src="'+LOGO_V+'" alt="Precise" width="128" height="100"></span></div>'+
        '<div><h1>Risk Management Cockpit</h1><div class="lg-sub" style="margin-top:8px;">ระบบติดตามความเสี่ยงองค์กรที่เชื่อม Strategic Objective, Corporate KPI และ KRI ของทุกบริษัทในกลุ่มไว้ที่เดียว</div></div>'+
        '<div class="lg-points">'+
          '<div>'+icon("heat")+'<span>ภาพรวมความเสี่ยงทั้งกลุ่มสำหรับผู้บริหารของกลุ่มและคณะกรรมการฯ</span></div>'+
          '<div>'+icon("pulse")+'<span>KRI รายเดือนเทียบ Risk Appetite และ Tolerance</span></div>'+
          '<div>'+icon("lock")+'<span>เห็นข้อมูลตามบทบาท ความเสี่ยง และบริษัทที่รับผิดชอบ</span></div>'+
        '</div>'+
      '</div>'+
      '<div class="login-main">'+
        '<h2>เข้าสู่ระบบ</h2>'+
        '<button type="button" class="sso-btn" disabled title="เปิดใช้เมื่อเชื่อมระบบยืนยันตัวตนขององค์กร">'+icon("sso")+'เข้าสู่ระบบด้วยบัญชีองค์กร (SSO) <small>เฟสถัดไป</small></button>'+
        '<div class="lg-or">หรือเลือกบทบาทเพื่อทดลองใช้งาน</div>'+
        '<div class="role-grid">'+DEMO_USERS.map(function(u){ var ro=ROLES[u.role];
          return '<button type="button" class="role-card" data-login="'+u.id+'"><span class="role-ic" style="background:'+ro.color+'">'+icon(ro.icon)+'</span><span><b>'+esc(ro.label)+'</b><span class="rc-sub">'+esc(ro.sub)+'</span><span class="rc-d">'+esc(ro.desc)+'</span><span class="rc-scope">ทดลองเป็น '+esc(u.name)+' · '+esc(u.demo)+'</span></span></button>'; }).join('')+'</div>'+
        '<div class="lg-note">ต้นแบบสาธิต — ยังไม่มีการยืนยันตัวตนจริง ระบบจริงจะใช้ SSO ขององค์กรร่วมกับ MFA และกำหนดสิทธิ์รายบุคคลจากฝ่ายบริหารความเสี่ยง</div>'+
      '</div>';
  }
  function renderUserSlot(){
    var el=document.getElementById("userSlot"); if(!el) return;
    if(!currentUser){ el.innerHTML=''; return; }
    var ro=roleOf();
    el.innerHTML = '<button type="button" class="user-chip" id="userChip" aria-haspopup="menu" aria-expanded="'+userMenuOpen+'" title="'+escAttr(currentUser.name+' · '+ro.label)+'" aria-label="บัญชีผู้ใช้: '+escAttr(currentUser.name)+'">'+avatarHtml(currentUser)+'<span class="uc-t"><b>'+esc(currentUser.name)+'</b><small>'+esc(ro.label)+'</small></span>'+icon("chevd","chev-d")+'</button>'+
      (userMenuOpen ? '<div class="user-menu" role="menu"><div class="um-head">'+avatarHtml(currentUser)+'<div><b>'+esc(currentUser.name)+'</b><small>'+esc(ro.label)+' · '+esc(ro.sub)+'</small><small>ขอบเขต: '+esc(currentUser.demo)+'</small></div></div>'+
        '<button type="button" class="um-item" data-umenu="access" role="menuitem">'+icon("key")+'สิทธิ์ของฉัน</button>'+
        '<button type="button" class="um-item" data-umenu="switch" role="menuitem">'+icon("swap")+'สลับบทบาท (สาธิต)</button>'+
        '<button type="button" class="um-item" data-umenu="logout" role="menuitem">'+icon("logout")+'ออกจากระบบ</button></div>' : '');
  }
  function showLogin(){ var el=document.getElementById("login"); renderLogin(); el.hidden=false; document.body.style.overflow="hidden"; var f=el.querySelector(".role-card"); if(f) f.focus(); }
  function loginAs(id, restoring){
    var u=DEMO_USERS.filter(function(x){ return x.id===id; })[0]; if(!u) return;
    currentUser=u; userMenuOpen=false; selectedRisk=null;
    activeFilter = u.scope==="ALL" ? [] : [u.scope]; riskLvl=[]; kriSt=[];
    if(restoring) restoreState(); else saveState();
    try{ localStorage.setItem("prc-demo-user", u.id); }catch(err){}
    document.getElementById("login").hidden=true; document.body.style.overflow="";
    build(); renderUserSlot();
  }
  function logout(){ currentUser=null; userMenuOpen=false; try{ localStorage.removeItem("prc-demo-user"); }catch(err){} renderUserSlot(); showLogin(); }
  var toastTimer=null;
  function toast(msg){ var t=document.querySelector(".toast"); if(!t){ t=document.createElement("div"); t.className="toast"; t.setAttribute("role","status"); document.body.appendChild(t); }
    t.textContent=msg; t.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(function(){ t.hidden=true; }, 2800); }

  function renderAccess(){
    var me = currentUser ? currentUser.role : null;
    var cards = ROLE_ORDER.map(function(k){ var ro=ROLES[k], u=DEMO_USERS.filter(function(x){ return x.role===k; })[0];
      return '<div class="acc-role'+(k===me?' me':'')+'"><span class="role-ic" style="background:'+ro.color+'">'+icon(ro.icon)+'</span><div><b>'+(ROLE_ORDER.indexOf(k)+1)+'. '+esc(ro.label)+'</b>'+(k===me?'<span class="acc-me">คุณ</span>':'')+'<span class="rc-sub">'+esc(ro.sub)+'</span><p>'+esc(ro.desc)+'</p><p style="margin-top:6px;"><span class="rc-scope" style="display:inline-block;font-size:11px;font-weight:700;color:var(--brand-700);background:var(--brand-100);border-radius:4px;padding:1px 6px;">ขอบเขต: '+esc(ro.scopeText)+'</span></p></div></div>'; }).join('');
    function cell(v){ if(v==="y") return '<span class="pm-y" title="ได้">'+icon("check")+'</span>'; if(v==="own") return '<span class="pm-p">ที่ได้รับมอบหมาย</span>'; if(v==="mine") return '<span class="pm-p">ความเสี่ยงของตน</span>'; if(v) return '<span class="pm-p">'+esc(v)+'</span>'; return '<span class="pm-n">—</span>'; }
    var head = '<tr><th>สิทธิ์การใช้งาน</th>'+ROLE_ORDER.map(function(k){ return '<th class="'+(k===me?'me':'')+'">'+esc(ROLES[k].label)+'<span class="pm-sub">'+esc(ROLES[k].sub)+'</span></th>'; }).join('')+'</tr>';
    var rows = PERMS.map(function(p){ return '<tr><td>'+esc(p.cap)+'</td>'+ROLE_ORDER.map(function(k){ return '<td class="'+(k===me?'me':'')+'">'+cell(p[k])+'</td>'; }).join('')+'</tr>'; }).join('');
    var users = (me==="admin") ? '<div class="card"><h3 style="display:flex;align-items:center;gap:8px;">'+icon("users")+'ผู้ใช้ในระบบ</h3>'+
      '<div class="tbl-wrap"><table><thead><tr><th>ผู้ใช้</th><th>บทบาท</th><th>ขอบเขต</th><th>สถานะ</th></tr></thead><tbody>'+
      DEMO_USERS.map(function(u){ return '<tr><td><span style="display:inline-flex;align-items:center;gap:8px;">'+avatarHtml(u)+esc(u.name)+'</span></td><td>'+esc(ROLES[u.role].label)+' <span style="color:var(--ink-faint);font-size:12.5px;">· '+esc(ROLES[u.role].sub)+'</span></td><td>'+esc(u.demo)+'</td><td>'+'<span class="pill good">ใช้งาน</span>'+'</td></tr>'; }).join('')+invitedRows()+
      '</tbody></table></div><div style="margin-top:12px;"><button type="button" class="ra-btn primary" data-invite="1">'+icon("user")+'เชิญผู้ใช้</button></div></div>' : '';
    return ''+
    '<div class="page-head"><div><h2>Roles &amp; Access</h2><div class="sub">บทบาทผู้ใช้ ขอบเขตข้อมูล และสิทธิ์การใช้งานของระบบ — ไฮไลต์คือบทบาทที่คุณเข้าสู่ระบบอยู่</div></div></div>'+
    '<div class="acc-roles">'+cards+'</div>'+
    '<div class="card"><h3>สิทธิ์ตามบทบาท</h3><div class="tbl-wrap"><table class="perm-tbl">'+head+rows+'</table></div>'+
      '<div class="hint" style="margin-top:10px;">"ที่ได้รับมอบหมาย" = Risk Coordinator ทำได้เฉพาะความเสี่ยงหรือบริษัทย่อยที่ได้รับมอบหมาย · "ความเสี่ยงของตน" = Risk Owner ทำได้เฉพาะความเสี่ยงที่ตนเป็นเจ้าของ · ข้อความสีน้ำเงิน = บทบาทในขั้นตอนอนุมัติ · Appetite/Tolerance: Risk Owner และ Admin เสนอ → ผู้บริหารของกลุ่มทบทวน → คณะกรรมการฯ (RMC) อนุมัติในที่ประชุม → Admin บันทึกมติเข้าระบบ · คณะกรรมการฯ ใช้ระบบแบบอ่านอย่างเดียว</div></div>'+
    users+
    '<div class="card"><h3>หลักการออกแบบการเข้าถึง</h3><div class="acc-notes">'+
      '<div>'+icon("sso")+'<span><b>SSO + MFA</b> ใช้บัญชีองค์กรเดิม ไม่ต้องจำรหัสผ่านใหม่ และหมดเวลาการใช้งานอัตโนมัติเมื่อไม่ได้ใช้งาน</span></div>'+
      '<div>'+icon("layers")+'<span><b>สิทธิ์ผูกกับความเสี่ยงและบริษัท</b> Risk Owner เห็นเฉพาะความเสี่ยงที่ตนเป็นเจ้าของ Risk Coordinator เห็นเฉพาะความเสี่ยงหรือบริษัทย่อยที่ได้รับมอบหมาย</span></div>'+
      '<div>'+icon("check")+'<span><b>แยกผู้บันทึกกับผู้ตรวจ</b> Risk Owner บันทึกค่า KRI → Risk Coordinator ตรวจ → Risk ส่วนกลางวิเคราะห์และรวบรวม → ผู้บริหารของกลุ่มทบทวน → เสนอคณะกรรมการฯ ในที่ประชุม</span></div>'+
      '<div>'+icon("history")+'<span><b>Audit Trail</b> ทุกการแก้ไขเก็บผู้แก้ วันเวลา ค่าเดิม และค่าใหม่ ให้ Internal Audit ตรวจย้อนหลังได้</span></div>'+
    '</div></div>';
  }

  var PAGES = [
    {id:"matrix", label:"Home", icon:"dash", render:renderMatrix},
    {id:"overview", label:"Objectives & KPI", icon:"flag", render:renderOverview},
    {id:"detail", label:"Risk Register", icon:"shield", render:renderDetail, grp:"risk", desc:"ทะเบียนความเสี่ยง สาเหตุ และแนวทางจัดการ"},
    {id:"kri", label:"KRI Monitoring", icon:"pulse", render:renderKri, grp:"risk", desc:"สัญญาณเตือนล่วงหน้า อัปเดตรายเดือน"},
    {id:"review", label:"Quarterly Review", icon:"calq", render:renderReview},
    {id:"yearly", label:"Yearly Review", icon:"cal", render:renderYearly},
    {id:"revision", label:"Audit Trail", icon:"history", render:renderRevision, nav:false},
    {id:"access", label:"Roles & Access", icon:"key", render:renderAccess, nav:false}
  ];
  // ร่างรายงาน RMC (renderReport) เอาไว้ก่อนตามที่ผู้ใช้แจ้ง — ฟังก์ชันยังอยู่ในโค้ด พร้อมเพิ่มกลับเข้า PAGES ภายหลัง

  var FILTERABLE = ["matrix","kri","detail","revision","review","yearly"];
  var tabnav=document.getElementById("tabnav");
  var panels=document.getElementById("panels");

  /* multi-page: each page is its own HTML file; shared state travels through sessionStorage */
  var PAGE_FILE = {matrix:"index.html", overview:"objectives.html", detail:"register.html", kri:"kri.html", review:"review.html", yearly:"yearly.html", revision:"revision.html", access:"access.html"};
  var CUR = (window.PRC_PAGE && PAGE_FILE[window.PRC_PAGE]) ? window.PRC_PAGE : "matrix";
  var STATE_KEYS = ["activeFilter","riskLvl","kriSt","regCell","overviewView","regFilter","cmLevel","histPeriod","riskObjs","riskQ","kriView","audF","revA","revB","revView","rvQ","rvStep","rvF3","yrStep"];
  function stateGet(){ return {activeFilter:activeFilter, riskLvl:riskLvl, kriSt:kriSt, regCell:regCell, overviewView:overviewView, regFilter:regFilter, cmLevel:cmLevel, histPeriod:histPeriod, riskObjs:riskObjs, riskQ:riskQ, kriView:kriView, audF:audF, revA:revA, revB:revB, revView:revView, rvQ:rvQ, rvStep:rvStep, rvF3:rvF3, yrStep:yrStep}; }
  function saveState(){ try{ sessionStorage.setItem("prc-state", JSON.stringify(stateGet())); }catch(err){} }
  function restoreState(){ var st=null; try{ st=JSON.parse(sessionStorage.getItem("prc-state")||"null"); }catch(err){} if(!st) return;
    if(Array.isArray(st.activeFilter)) activeFilter=st.activeFilter; if(Array.isArray(st.riskLvl)) riskLvl=st.riskLvl; if(Array.isArray(st.kriSt)) kriSt=st.kriSt;
    if(Array.isArray(st.riskObjs)) riskObjs=st.riskObjs; if(typeof st.riskQ==="string") riskQ=st.riskQ; if(st.kriView) kriView=st.kriView; if(st.audF) audF=st.audF; if(st.revA) revA=st.revA; if(st.revB) revB=st.revB; if(st.revView) revView=st.revView; if(st.rvQ && qById(st.rvQ)) rvQ=st.rvQ; if(st.rvStep) rvStep=+st.rvStep; if(st.rvF3) rvF3=st.rvF3; if(st.yrStep) yrStep=+st.yrStep; if(st.regCell!==undefined) regCell=st.regCell; if(st.overviewView) overviewView = st.overviewView==="risk" ? "table" : st.overviewView;
    if(st.regFilter) regFilter=st.regFilter; if(st.cmLevel) cmLevel=st.cmLevel; if(st.histPeriod) histPeriod=st.histPeriod;
    if(lockedScope()) activeFilter=[lockedScope()]; }
  function setPending(p){ try{ sessionStorage.setItem("prc-pending", JSON.stringify(p)); }catch(err){} }
  function runPending(){ var p=null; try{ p=JSON.parse(sessionStorage.getItem("prc-pending")||"null"); sessionStorage.removeItem("prc-pending"); }catch(err){} if(!p || p.page!==CUR) return;
    setTimeout(function(){
      if(p.t==="sub"){ var cards=document.querySelectorAll('.risk-card[data-sub="'+p.sub+'"]'); cards.forEach(function(c){ c.classList.add("open"); }); if(cards.length) cards[0].scrollIntoView({block:"center"}); }
      if(p.t==="obj"){ var el=document.getElementById("po-"+p.code); if(el) el.scrollIntoView({block:"start"}); }
    }, 30); }
  window.addEventListener("pagehide", saveState);

  function build(){
    tabnav.innerHTML = PAGES.filter(function(p){ return p.nav!==false; }).map(function(p){
      return '<a class="tab-btn'+(p.id===CUR?' active':'')+'" href="'+PAGE_FILE[p.id]+'" data-page="'+p.id+'"'+(p.id===CUR?' aria-current="page"':'')+'>'+icon(p.icon)+esc(p.label)+'</a>';
    }).join("");
    panels.innerHTML = '<section class="panel" id="page-'+CUR+'"></section>';
    document.getElementById("page-"+CUR).innerHTML = PAGES.filter(function(p){ return p.id===CUR; })[0].render();
    cmApply();
  }

  function rerenderFilterable(){
    if(lockedScope()) activeFilter=[lockedScope()];
    if(CUR==="overview" && overviewView==="risk"){ var ov=document.getElementById("page-overview"); if(ov){ ov.innerHTML=renderOverview(); cmApply(); } }
    FILTERABLE.forEach(function(id){
      var el=document.getElementById("page-"+id);
      if(el) el.innerHTML = PAGES.filter(function(p){return p.id===id;})[0].render();
    });
    cmApply();
  }

  function rerenderOverview(){
    var el=document.getElementById("page-overview");
    if(el) el.innerHTML = PAGES.filter(function(p){return p.id==="overview";})[0].render();
    cmApply();
    if(domPinned) showDom(domPinned);
  }

  function goToPage(id){
    if(id===CUR){ window.scrollTo({top:0, behavior:"smooth"}); return; }
    saveState(); window.location.href = PAGE_FILE[id] || "index.html";
  }

  tabnav.addEventListener("click", function(e){
    var btn=e.target.closest(".tab-btn");
    if(!btn || e.metaKey || e.ctrlKey || e.shiftKey || e.button===1) { saveState(); return; }
    e.preventDefault(); goToPage(btn.getAttribute("data-page"));
  });

  panels.addEventListener("input", function(e){
    if(e.target.id!=="riskQ") return;
    var pos=e.target.selectionStart; riskQ=e.target.value.trim()?e.target.value:""; rerenderFilterable();
    var q=document.getElementById("riskQ"); if(q){ q.value=e.target.value; q.focus(); try{ q.setSelectionRange(pos,pos); }catch(err){} }
  });
  panels.addEventListener("change", function(e){
    if(e.target.id==="revA" || e.target.id==="revB"){ if(e.target.id==="revA") revA=e.target.value; else revB=e.target.value; rerenderFilterable(); var rs=document.getElementById(e.target.id); if(rs) rs.focus(); return; }
    if(e.target.id==="histSelect"){ histSel=e.target.value; rerenderRiskModal(false); var hs2=document.getElementById("histSelect"); if(hs2) hs2.focus(); return; }
    var sel=e.target.closest(".company-filter");
    if(!sel) return;
    activeFilter = sel.value==="ALL" ? [] : [sel.value];
    rerenderFilterable();
  });

  function clearKpiHighlight(){
    var cm=document.querySelector(".cm"); if(!cm) return;
    cm.classList.remove("cm-focus");
    cm.querySelectorAll(".cm-hl, .cm-hl-self").forEach(function(el){ el.classList.remove("cm-hl","cm-hl-self"); });
  }
  function highlightKpi(id){
    var cm=document.querySelector(".cm"); var k=kpiById(id); if(!cm || !k) return;
    var L=buildKpiLinks();
    var rel = k.level==="Corporate" ? (L.down[id]||[]) : (L.up[id]||[]);
    clearKpiHighlight();
    cm.classList.add("cm-focus");
    cm.querySelectorAll(".cm-kpi[data-kpi]").forEach(function(el){
      var kid=el.getAttribute("data-kpi");
      if(kid===id) el.classList.add("cm-hl-self");
      else if(rel.indexOf(kid)!==-1) el.classList.add("cm-hl");
    });
  }
  /* crosshair: pointer over the company dots -> highlight that row + that company column (no link fade) */
  function clearCross(){
    var cm=document.querySelector(".cm"); if(!cm) return;
    var band=cm.querySelector(".cm-colband"); if(band) band.classList.remove("on");
    cm.querySelectorAll(".cm-xrow, .xcol, .xcell").forEach(function(el){ el.classList.remove("cm-xrow","xcol","xcell"); });
  }
  function showCross(dots, idx, row){
    var cm=document.querySelector(".cm"); if(!cm || !dots) return;
    var n=dots.children.length; if(idx<0 || idx>=n) return;
    clearCross(); clearKpiHighlight();
    var cr=cm.getBoundingClientRect(), cell=dots.children[idx].getBoundingClientRect(), w=32;
    var band=cm.querySelector(".cm-colband");
    if(band){ band.style.left=(cell.left+cell.width/2-w/2-cr.left)+"px"; band.style.width=w+"px"; band.classList.add("on"); }
    var hb=cm.querySelectorAll(".cm-dots-head b")[idx]; if(hb) hb.classList.add("xcol");
    if(row){ row.classList.add("cm-xrow"); var d=row.querySelectorAll(".cm-dot")[idx]; if(d) d.classList.add("xcell"); }
  }
  /* KPI Framework bar: hover or focus a domain segment to expand its purpose; click/tap pins it */
  var domPinned = null;
  function purposeHtml(t){ return esc(t).replace(/\*\*(.+?)\*\*/g,'<mark class="kw">$1</mark>'); }
  function purposeText(t){ return String(t||"").replace(/\*\*/g,""); }
  function showDom(code){
    var card=document.querySelector("#page-overview .kpi-level"); if(!card) return;
    var det=card.querySelector("#domDetail"), bar=card.querySelector(".bsc-weight-bar"); if(!det||!bar) return;
    var p = code ? BSC_PERSPECTIVES.filter(function(x){ return x.code===code; })[0] : null;
    bar.classList.toggle("has-on", !!p);
    bar.querySelectorAll(".bsc-seg").forEach(function(b){ var on=!!p && b.getAttribute("data-dom")===code; b.classList.toggle("on", on); b.setAttribute("aria-expanded", on?"true":"false"); });
    det.querySelector(".dd-in").innerHTML = p
      ? '<div class="dd-row" style="--dc:'+p.color+'"><span class="persp-chip" style="background:'+p.color+';">'+p.code+'</span><div><b>'+esc(p.name)+'</b><span class="dp-w">'+Math.round(p.weight*100)+'% · '+esc(p.th)+'</span><p>'+purposeHtml(p.purpose)+'</p></div></div>'
      : '<span class="dd-hint">ชี้หรือแตะที่แถบสีเพื่อดูเป้าประสงค์ของแต่ละ Domain</span>';
    det.classList.toggle("open", !!p);
  }
  panels.addEventListener("mouseover", function(e){ var sg=e.target.closest && e.target.closest(".bsc-seg[data-dom]"); if(sg) showDom(sg.getAttribute("data-dom")); });
  panels.addEventListener("mouseout", function(e){ var bar=e.target.closest && e.target.closest(".bsc-weight-bar"); if(bar && !bar.contains(e.relatedTarget)) showDom(domPinned); });
  panels.addEventListener("focusin", function(e){ var sg=e.target.closest && e.target.closest(".bsc-seg[data-dom]"); if(sg && sg.matches(":focus-visible")) showDom(sg.getAttribute("data-dom")); });
  panels.addEventListener("click", function(e){ var sg=e.target.closest(".bsc-seg[data-dom]"); if(!sg) return; var c=sg.getAttribute("data-dom"); domPinned = (domPinned===c) ? null : c; showDom(domPinned); if(!domPinned) sg.blur(); });

  panels.addEventListener("mousemove", function(e){
    var dots=e.target.closest && e.target.closest(".cm .cm-dots");
    if(!dots){ if(document.querySelector(".cm .cm-xrow, .cm .xcol")) clearCross(); return; }
    var vis=Array.prototype.filter.call(dots.children, function(c){ return getComputedStyle(c).display!=="none"; });
    if(!vis.length) return;
    var dr=dots.getBoundingClientRect();
    var vi=Math.floor((e.clientX-dr.left)/(dr.width/vis.length));
    vi=Math.max(0, Math.min(vis.length-1, vi));
    showCross(dots, Array.prototype.indexOf.call(dots.children, vis[vi]), dots.closest(".cm-kpi"));
  });
  panels.addEventListener("mouseleave", clearCross);
  function syncStickyTop(){
    var tb=document.querySelector(".topbar");
    if(tb) document.documentElement.style.setProperty("--topbar-h", tb.offsetHeight+"px");
    var h=document.querySelector(".cm-head");
    if(h && tb) h.classList.toggle("stuck", h.parentNode.getBoundingClientRect().top < tb.getBoundingClientRect().bottom - 1);
  }
  window.addEventListener("resize", syncStickyTop);
  window.addEventListener("scroll", syncStickyTop, {passive:true});
  setTimeout(syncStickyTop, 0);
  panels.addEventListener("mouseover", function(e){
    var h=e.target.closest && e.target.closest(".hist-hit"); if(!h) return;
    var box=h.closest(".hist-chart"), tip=box.querySelector(".hist-tip"), br=box.getBoundingClientRect(), hr=h.getBoundingClientRect();
    tip.textContent=h.getAttribute("data-tip"); tip.hidden=false;
    var x=hr.left+hr.width/2-br.left, y=hr.top-br.top;
    tip.style.left=Math.max(4, Math.min(x-tip.offsetWidth/2, br.width-tip.offsetWidth-4))+"px"; tip.style.top=Math.max(0,y-tip.offsetHeight-6)+"px";
  });
  panels.addEventListener("mouseout", function(e){ var h=e.target.closest && e.target.closest(".hist-hit"); if(h){ var t=h.closest(".hist-chart").querySelector(".hist-tip"); if(t) t.hidden=true; } });
  var histTblOpen = false;
  document.addEventListener("toggle", function(e){ if(e.target.classList && e.target.classList.contains("hist-tbl-d")) histTblOpen = e.target.open; }, true);
  /* history table row ↔ chart point: hovering a row shows that point's tooltip */
  function histHit(tr){ var box=tr.closest(".hist"); return box ? box.querySelectorAll(".hist-hit")[+tr.getAttribute("data-pt")] : null; }
  panels.addEventListener("mouseover", function(e){ var tr=e.target.closest && e.target.closest(".hist-v tr[data-pt]"); if(!tr) return; var h=histHit(tr); if(h){ h.dispatchEvent(new MouseEvent("mouseover",{bubbles:true})); h.previousSibling && h.previousSibling.classList.add("on"); } });
  panels.addEventListener("mouseout", function(e){ var tr=e.target.closest && e.target.closest(".hist-v tr[data-pt]"); if(!tr || (e.relatedTarget && tr.contains(e.relatedTarget))) return; var h=histHit(tr); if(h){ h.dispatchEvent(new MouseEvent("mouseout",{bubbles:true})); h.previousSibling && h.previousSibling.classList.remove("on"); } });
  function kpiLineFrom(e){ return e.target.closest && e.target.closest(".cm .cm-kpi[data-kpi]"); }
  panels.addEventListener("mouseover", function(e){ var b=kpiLineFrom(e); if(b && !e.target.closest(".cm-dots")){ clearCross(); highlightKpi(b.getAttribute("data-kpi")); } });
  panels.addEventListener("mouseout", function(e){ var b=kpiLineFrom(e); if(b && !(e.relatedTarget && b.contains(e.relatedTarget))) clearKpiHighlight(); });
  panels.addEventListener("focusin", function(e){ var b=kpiLineFrom(e); if(b) highlightKpi(b.getAttribute("data-kpi")); });
  panels.addEventListener("focusout", function(e){ if(kpiLineFrom(e)) clearKpiHighlight(); });

  panels.addEventListener("click", function(e){
    var head=e.target.closest(".risk-head");
    if(head && !head.closest(".modal-box")){
      head.closest(".risk-card").classList.toggle("open");
      return;
    }

    var gotoBtn=e.target.closest(".btn-outline[data-sub]");
    if(gotoBtn){
      var gsub=gotoBtn.getAttribute("data-sub");
      activeFilter = [gsub];
      setPending({page:"detail", t:"sub", sub:gsub});
      goToPage("detail");
      return;
    }

    var cml=e.target.closest("[data-cmlv]");
    if(cml){ cmLevel=+cml.getAttribute("data-cmlv"); cmObj={}; cmDom={}; cmApply(); return; }
    var cmo=e.target.closest("[data-cmobj]");
    if(cmo){ var oc2=cmo.getAttribute("data-cmobj"), r2=cmo.closest(".cm-row"), full2=cmFull(cmEff(oc2), r2?+r2.getAttribute("data-ncom"):0);
      cmObj[oc2] = full2 ? 1 : 3; if(cmObj[oc2]===cmRowLv()) delete cmObj[oc2]; cmApply(); return; }
    var cmx=e.target.closest("[data-cmx]");
    if(cmx){ var oc3=cmx.getAttribute("data-cmx"); cmObj[oc3]=3; if(cmRowLv()===3) delete cmObj[oc3]; cmApply(); var t3=document.querySelector('#page-overview .cm-row[data-obj="'+oc3+'"] .cm-tg'); if(t3) t3.focus(); return; }
    var cmd=e.target.closest("[data-cmdom]");
    if(cmd){ var dc=cmd.getAttribute("data-cmdom"); if(cmDom[dc]) delete cmDom[dc]; else cmDom[dc]=true; cmApply(); return; }

    var kpiBtn=e.target.closest("[data-kpi]");
    if(kpiBtn){
      selectedKpi = kpiBtn.getAttribute("data-kpi");
      rerenderOverview();
      return;
    }
    if(e.target.closest("#kpiModalClose")){
      selectedKpi = null;
      rerenderOverview();
      return;
    }

    var modalClose=e.target.closest("#companyModalClose");
    if(modalClose){
      selectedCompany = null;
      rerenderOverview();
      return;
    }
    if(e.target.classList && e.target.classList.contains("modal-backdrop")){
      if(selectedRisk!==null){ selectedRisk=null; rerenderFilterable(); return; }
      selectedCompany = null;
      selectedKpi = null;
      rerenderOverview();
      return;
    }

    var hs=e.target.closest("[data-hist]");
    if(hs){ histSel=hs.getAttribute("data-hist"); var kf=hs.getAttribute("data-kbf");
      if(kf!==null){ kbFactor = (kf==="ALL" || kf==="CORE") ? kf : +kf; if(typeof kbFactor==="number" && kbFactor>0) focusFactor(kbFactor); }
      rerenderRiskModal(true); return; }
    var hp=e.target.closest("[data-hper]");
    if(hp){ histPeriod=hp.getAttribute("data-hper"); rerenderRiskModal(false); return; }
    var rmt=e.target.closest("[data-rmtab]");
    if(rmt){ rmTab=rmt.getAttribute("data-rmtab"); rerenderRiskModal(false); var tb=document.querySelector('[data-rmtab="'+rmTab+'"]'); if(tb) tb.focus(); return; }
    var rvv=e.target.closest("[data-rvview]");
    if(rvv){ revView=rvv.getAttribute("data-rvview"); rerenderFilterable(); return; }
    var rk=e.target.closest("[data-risk]");
    if(rk){ if(rk.getAttribute("data-risk")!==selectedRisk) rmTab="detail"; selectedRisk=rk.getAttribute("data-risk"); histSel=rk.getAttribute("data-hsel")||"kri:0";
      var rsel=RISKS.filter(function(x){ return x.id===selectedRisk; })[0];
      kbFactor = (!rk.hasAttribute("data-hsel") && rsel && rsel.kris.some(function(k){ return k.core; })) ? "CORE" : "ALL"; rerenderFilterable();
      if(rk.hasAttribute("data-hsel") && window.innerWidth<=1100){ var hh=document.querySelector('[id^="page-"]:not([hidden]) #riskHist'); if(hh) hh.scrollIntoView({block:"start"}); }
      return; }
    if(e.target.closest("#riskModalClose")){ selectedRisk=null; rerenderFilterable(); return; }

    if(e.target.closest("[data-goto-crit]")){ kriSt=["crit"]; kriView="now"; goToPage("kri"); return; }
    var kv=e.target.closest("[data-kview]");
    if(kv){ kriView=kv.getAttribute("data-kview"); rerenderFilterable(); return; }
    var aum=e.target.closest("[data-aud-more]");
    if(aum){ audLimit+=60; rerenderFilterable(); return; }
    var pv=e.target.closest("[data-pview]");
    if(pv){ profileView=pv.getAttribute("data-pview"); regCell=null; rerenderFilterable(); return; }
    var go=e.target.closest("[data-goto-obj]");
    if(go){
      var oc=go.getAttribute("data-goto-obj");
      riskObjs=[oc]; riskQ=""; riskLvl=[]; regCell=null;
      if(CUR==="detail"){ rerenderFilterable(); window.scrollTo(0,0); } else goToPage("detail");
      return;
    }

    var rk=e.target.closest("[data-rk]");
    if(rk){
      var kk=rk.getAttribute("data-rk"), vv=rk.getAttribute("data-val");
      if(kk==="clear"){ if(!lockedScope()) activeFilter=[]; riskLvl=[]; kriSt=[]; riskObjs=[]; riskQ=""; }
      else if(kk==="obj"){ riskObjs = toggleSel(riskObjs, vv); }
      else if(kk==="tier"){ var tc=Object.keys(OBJ_TIER).filter(function(c){ return OBJ_TIER[c]===+vv; });
        riskObjs = tc.every(function(c){ return riskObjs.indexOf(c)!==-1; }) ? riskObjs.filter(function(c){ return tc.indexOf(c)===-1; }) : riskObjs.concat(tc.filter(function(c){ return riskObjs.indexOf(c)===-1; })); }
      else if(kk==="aud"){ audF=vv; audLimit=60; }
      else if(kk==="co"){ activeFilter = toggleSel(activeFilter, vv); }
      else if(kk==="lvl"){ riskLvl = toggleSel(riskLvl, vv); if(vv==="ALL") regCell=null; }
      else if(kk==="st"){ kriSt = toggleSel(kriSt, vv); }
      if(kk!=="lvl" && kk!=="obj" && kk!=="co" && kk!=="tier") regCell=null; rerenderFilterable(); return;
    }
    var rf=e.target.closest("[data-rf]");
    if(rf){
      var key=rf.getAttribute("data-rf");
      if(key==="clear") regFilter={co:"ALL", dom:"ALL", lvl:"ALL", tier:"ALL"};
      else { var v=rf.getAttribute("data-val"); regFilter[key] = (regFilter[key]===v && v!=="ALL") ? "ALL" : v; }
      rerenderOverview();
      return;
    }

    var viewBtn=e.target.closest(".view-toggle-btn");
    if(viewBtn){
      overviewView = viewBtn.getAttribute("data-view");
      rerenderOverview();
      return;
    }

    var toggle=e.target.closest(".org-expand-toggle");
    if(toggle){
      var pid=toggle.getAttribute("data-parent");
      collapsedParents[pid] = !collapsedParents[pid];
      rerenderOverview();
      return;
    }

    var parentBox=e.target.closest(".org-parent");
    if(parentBox){
      selectedCompany = parentBox.getAttribute("data-sub");
      rerenderOverview();
      return;
    }
    var child=e.target.closest(".org-kid");
    if(child){
      selectedCompany = child.getAttribute("data-sub");
      rerenderOverview();
      return;
    }
    var node=e.target.closest(".org-node");
    if(node){
      selectedCompany = node.getAttribute("data-sub");
      rerenderOverview();
    }
  });

  // one "active factor" shared by the accordion (left) and the KRI panel filter (right)
  function focusFactor(n){ var r=RISKS.filter(function(x){ return x.id===selectedRisk; })[0]; if(!r) return;
    r.factors.forEach(function(f,i){ factorOpen[r.id+":"+i] = (i+1===n); }); }
  var userToggleKey = null; // set when a person clicks a factor header, so render-time toggles are ignored
  function rerenderHistOnly(){
    var box=document.querySelector('[id^="page-"]:not([hidden]) #riskModalBackdrop .modal-box'); var r=RISKS.filter(function(x){ return x.id===selectedRisk; })[0];
    var h=box && box.querySelector("#riskHist"); if(!h || !r) return;
    var tmp=document.createElement("div"); tmp.innerHTML=histSectionHtml(r); if(tmp.firstElementChild) h.replaceWith(tmp.firstElementChild);
  }
  document.addEventListener("toggle", function(e){
    var d=e.target; if(!d || !d.matches || !d.matches("details.rfx[data-fkey]")) return;
    factorOpen[d.getAttribute("data-fkey")] = d.open;
    if(userToggleKey===d.getAttribute("data-fkey") && d.closest(".modal-box")){
      userToggleKey=null;
      var fi=+d.getAttribute("data-fkey").split(":")[1]+1;
      if(d.open){ kbFactor=fi; focusFactor(fi); histSel=null; } else if(kbFactor===fi){ kbFactor="ALL"; }
      rerenderRiskModal(false);
    }
    var box=d.closest(".modal-box"), btn=box && box.querySelector(".rfx-all");
    if(btn){ var all=Array.prototype.every.call(box.querySelectorAll("details.rfx"), function(x){ return x.open; });
      btn.setAttribute("data-fall", all?"close":"open"); btn.textContent = all?"ย่อทั้งหมด":"ขยายทั้งหมด"; }
  }, true);
  document.addEventListener("click", function(e){
    var gp=e.target.closest("[data-goto-page]");
    if(gp){ if(!currentUser) return; goToPage(gp.getAttribute("data-goto-page")); return; }
    var gc=e.target.closest("[data-cell]");
    if(gc){ regCell=gc.getAttribute("data-cell"); profileView="list"; riskLvl=[]; selectedRisk=null; if(CUR==="detail") rerenderFilterable(); else goToPage("detail"); return; }
    if(e.target.closest("[data-goto-reg]")){ regCell=null; profileView="list"; riskLvl=[]; selectedRisk=null; if(CUR==="detail") rerenderFilterable(); else goToPage("detail"); return; }
    if(e.target.closest("[data-cell-clear]")){ regCell=null; rerenderFilterable(); return; }
    var fsum=e.target.closest("details.rfx[data-fkey] > summary"); if(fsum){ userToggleKey=fsum.parentNode.getAttribute("data-fkey"); }
    var fa=e.target.closest("[data-fall]");
    if(fa){ var openAll=fa.getAttribute("data-fall")==="open", box=fa.closest(".modal-box");
      if(box) box.querySelectorAll("details.rfx").forEach(function(d){ d.open=openAll; d.classList.remove("active"); });
      if(kbFactor!=="ALL"){ kbFactor="ALL"; rerenderHistOnly(); }
      return; }
    var lg=e.target.closest("[data-login]"); if(lg){ loginAs(lg.getAttribute("data-login")); return; }
    if(e.target.closest("#userChip")){ userMenuOpen=!userMenuOpen; renderUserSlot(); return; }
    var um=e.target.closest("[data-umenu]");
    if(um){ var a=um.getAttribute("data-umenu"); userMenuOpen=false; renderUserSlot();
      if(a==="access") goToPage("access"); else logout(); return; }
    if(userMenuOpen && !e.target.closest(".user-menu")){ userMenuOpen=false; renderUserSlot(); }
    var dm=e.target.closest("[data-demo]"); if(dm){ toast(dm.getAttribute("data-demo")+" — ต้นแบบ: จะบันทึกได้เมื่อเชื่อมฐานข้อมูลในเฟสถัดไป"); return; }
  });
  document.addEventListener("keydown", function(e){
    if(e.key==="Escape" && dlg){ closeDlg(); return; }
    if(e.key==="Escape" && actEdit && actEdit.mv){ var mb=document.querySelector('#aeRoot [data-ae-mv="'+actEdit.mv+'"]'); actEdit.mv=null; keepScroll(renderActEditor); mb=document.querySelector('#aeRoot .ae2-mv'); if(mb) mb.focus(); return; }
    if(e.key==="Escape" && actEdit){ closeActEditor(); return; }
    if(e.key==="Escape" && userMenuOpen){ userMenuOpen=false; renderUserSlot(); var c=document.getElementById("userChip"); if(c) c.focus(); return; }
    if(e.key==="Escape" && selectedRisk!==null){ selectedRisk=null; rerenderFilterable(); return; }
    if(e.key==="Escape" && (selectedCompany!==null || selectedKpi!==null)){
      selectedCompany = null;
      selectedKpi = null;
      rerenderOverview();
    }
  });

  /* ---------------- EXPORT (Objective & KPI) ---------------- */
  var LIBS = {
    xlsx:"https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js",
    h2c:"https://cdn.jsdelivr.net/npm/html2canvas-pro@2.4.5/dist/html2canvas-pro.min.js",
    pdf:"https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    pptx:"https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js"
  };
  var libP = {};
  function loadLib(k){
    if(!libP[k]) libP[k] = new Promise(function(res, rej){
      var sc=document.createElement("script"); sc.src=LIBS[k]; sc.onload=function(){ res(); };
      sc.onerror=function(){ libP[k]=null; rej(new Error("lib")); }; document.head.appendChild(sc);
    });
    return libP[k];
  }
  /* inside the claude.ai viewer a page may not start downloads itself — the downloads capability asks the viewer instead */
  var dlP = (window.claude && typeof window.claude.use==="function") ? window.claude.use("downloads").catch(function(){ return null; }) : Promise.resolve(null);
  function saveFile(name, blob){
    return dlP.then(function(dl){
      if(dl) return dl.save({filename:name, data:blob}).then(function(){ toast("บันทึก "+name+" แล้ว"); }, function(err){
        if(err && err.code==="declined") return; toast("บันทึกไฟล์ในมุมมองนี้ไม่ได้"); });
      var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    });
  }
  function beDate(){ var d=new Date(); function z(n){ return (n<10?"0":"")+n; } return (d.getFullYear()+543)+"-"+z(d.getMonth()+1)+"-"+z(d.getDate()); }
  function regFilterText(){
    var t=[];
    if(regFilter.co!=="ALL") t.push("บริษัท "+regFilter.co);
    if(regFilter.dom!=="ALL"){ var dp=BSC_PERSPECTIVES.filter(function(x){ return x.code===regFilter.dom; })[0]; t.push("Domain "+(dp?dp.name:regFilter.dom)); }
    if(regFilter.lvl!=="ALL") t.push(regFilter.lvl+" KPI");
    if(regFilter.tier!=="ALL") t.push("Tier "+regFilter.tier);
    return t.length ? t.join(" · ") : "ทั้งหมด";
  }
  function exportBusy(kind, on){
    document.querySelectorAll('[data-export="'+kind+'"]').forEach(function(b){ b.disabled=on; b.classList.toggle("busy", on); });
  }
  function exportXlsx(){
    exportBusy("xlsx", true);
    loadLib("xlsx").then(function(){
      var wb=new window.ExcelJS.Workbook(); wb.creator="PRECISE Risk Management Cockpit"; wb.created=new Date();
      var cols=registerCompanyCols(), links=buildKpiLinks(), NAVY="FF1E2761", LINE={style:"thin", color:{argb:"FFD5DAE3"}};
      var FONT={name:"Tahoma", size:10};
      function hex(c){ return "FF"+String(c||"#888888").replace("#","").toUpperCase(); }
      function box(cell){ cell.border={top:LINE, left:LINE, bottom:LINE, right:LINE}; }
      /* sheet 1: KPI register */
      var ws=wb.addWorksheet("ทะเบียน KPI", {views:[{state:"frozen", xSplit:6, ySplit:4}], pageSetup:{orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, paperSize:9}});
      var head=["Domain","น้ำหนัก","Objective","ชื่อ Objective","Tier","รหัส KPI","ระดับ","KPI & เป้าหมาย","นิยาม / สูตรคำนวณ","ส่งผลต่อ / รวมจาก"].concat(cols.map(function(c){ return c.id; }));
      var widths=[16,8,9,42,6,12,11,50,64,24].concat(cols.map(function(){ return 6.5; }));
      ws.columns = widths.map(function(w){ return {width:w}; });
      ws.getCell("A1").value="ทะเบียนคุม KPI (KPI Register) — PRECISE"; ws.getCell("A1").font={name:"Tahoma", size:14, bold:true, color:{argb:NAVY}};
      ws.getCell("A2").value="ข้อมูล ณ "+asofFull()+" · ส่งออกเมื่อ "+beDate()+" · ตัวกรอง: "+regFilterText(); ws.getCell("A2").font={name:"Tahoma", size:10, color:{argb:"FF5B6472"}};
      var hr=ws.getRow(4); hr.values=head; hr.height=22;
      hr.eachCell(function(c, i){ c.font={name:"Tahoma", size:10, bold:true, color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern", pattern:"solid", fgColor:{argb:NAVY}}; c.alignment={vertical:"middle", horizontal:i>10?"center":"left", wrapText:true}; box(c); });
      var r=5, n=0;
      registerDomains().forEach(function(d){
        d.objs.forEach(function(o){
          o.corp.concat(o.comp).filter(regMatch).forEach(function(k){
            var isCorp=k.level==="Corporate", rel=isCorp ? (links.down[k.id]||[]) : (links.up[k.id]||[]);
            var row=ws.getRow(r);
            row.values=[d.p.code+" · "+d.p.name, d.p.weight, o.code, o.title, "T"+(OBJ_TIER[o.code]||""), k.id, isCorp?"Corporate":"Company", k.target, k.formula||"", (rel.length ? (isCorp?"รวมจาก ":"→ ")+rel.join(", ") : "")].concat(cols.map(function(c){ return k.applies.indexOf(c.id)!==-1 ? "●" : ""; }));
            row.eachCell({includeEmpty:true}, function(c, i){
              c.font=FONT; c.alignment={vertical:"top", wrapText:i<=10, horizontal:i>10||i===2||i===3||i===5?"center":"left"}; box(c);
              if(i>10 && c.value) c.font={name:"Tahoma", size:10, color:{argb:"FF1A9A51"}};
            });
            row.getCell(1).fill={type:"pattern", pattern:"solid", fgColor:{argb:hex(d.p.color)}}; row.getCell(1).font={name:"Tahoma", size:10, bold:true, color:{argb:"FFFFFFFF"}};
            row.getCell(2).numFmt="0%";
            if(isCorp){ [6,7,8].forEach(function(i){ row.getCell(i).fill={type:"pattern", pattern:"solid", fgColor:{argb:"FFEEF1FB"}}; }); row.getCell(8).font={name:"Tahoma", size:10, bold:true}; }
            row.getCell(6).font={name:"Consolas", size:10, bold:true, color:{argb:isCorp?"FF4F63D2":"FF1E2761"}};
            r++; n++;
          });
        });
      });
      ws.autoFilter={from:{row:4, column:1}, to:{row:4, column:head.length}};
      /* sheet 2: objectives */
      var wo=wb.addWorksheet("Objective", {views:[{state:"frozen", ySplit:1}]});
      wo.columns=[{width:16},{width:8},{width:60},{width:9},{width:48},{width:6},{width:22},{width:12},{width:12},{width:12}];
      var oh=wo.getRow(1); oh.values=["Domain","น้ำหนัก","เป้าประสงค์ของ Domain","Objective","ชื่อ Objective","Tier","ระดับ Tier","Corporate KPI","Company KPI","ความเสี่ยง"]; oh.height=22;
      oh.eachCell(function(c){ c.font={name:"Tahoma", size:10, bold:true, color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern", pattern:"solid", fgColor:{argb:NAVY}}; c.alignment={vertical:"middle", wrapText:true}; box(c); });
      var ro=2;
      registerDomains().forEach(function(d){
        d.objs.forEach(function(o){
          var t=OBJ_TIER[o.code], g=risksForObjective(RISKS,o.code);
          var row=wo.getRow(ro); row.values=[d.p.code+" · "+d.p.name, d.p.weight, purposeText(d.p.purpose), o.code, o.title, t?"T"+t:"", t?TIERS[t].name:"", o.corp.length, o.comp.length, g.primary.length+g.related.length];
          row.eachCell({includeEmpty:true}, function(c, i){ c.font=FONT; c.alignment={vertical:"top", wrapText:true, horizontal:(i===2||i>=6&&i!==7)?"center":"left"}; box(c); });
          row.getCell(1).fill={type:"pattern", pattern:"solid", fgColor:{argb:hex(d.p.color)}}; row.getCell(1).font={name:"Tahoma", size:10, bold:true, color:{argb:"FFFFFFFF"}};
          row.getCell(2).numFmt="0%"; ro++;
        });
      });
      ro++;
      [1,2,3].forEach(function(t){ var row=wo.getRow(ro++); row.getCell(1).value="T"+t+" · "+TIERS[t].name; row.getCell(1).font={name:"Tahoma", size:10, bold:true}; row.getCell(3).value=TIERS[t].def; row.getCell(3).font=FONT; });
      return wb.xlsx.writeBuffer().then(function(buf){
        return saveFile("PRECISE_KPI_Register_"+beDate()+".xlsx", new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      });
    }).catch(function(){ toast("สร้างไฟล์ Excel ไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่"); })
      .then(function(){ exportBusy("xlsx", false); });
  }
  function exportPdf(){
    exportBusy("pdf", true);
    var root=document.documentElement, prevTheme=root.getAttribute("data-theme"), sheet=null;
    Promise.all([loadLib("h2c"), loadLib("pdf")]).then(function(){
      var page=document.getElementById("page-overview"); if(!page) throw new Error("page");
      sheet=document.createElement("div"); sheet.className="pdf-sheet";
      sheet.innerHTML='<div class="pdf-head"><img src="'+LOGO_V+'" alt=""><div><h2>ทะเบียนคุม KPI (KPI Register)</h2><div>ข้อมูล ณ '+asofFull()+' · ส่งออกเมื่อ '+beDate()+' · ตัวกรอง: '+esc(regFilterText())+'</div></div></div>';
      var reg=page.querySelector(".cm"); reg=reg && reg.closest(".card"); if(!reg) throw new Error("register");
      var rc=reg.cloneNode(true); var ch=rc.querySelector(".card-head"); if(ch) ch.remove(); sheet.appendChild(rc);
      sheet.querySelectorAll(".dom-detail, .cm-colband, .modal-backdrop, .cm-lv-m").forEach(function(x){ x.remove(); });
      root.setAttribute("data-theme","light");
      document.body.appendChild(sheet);
      var sr=sheet.getBoundingClientRect(), cuts=[];
      sheet.querySelectorAll(".card, .cm-domain, .cm-row, .cm-foot-row, .cm-dhead, .org-row, .org-kids-row").forEach(function(el){ cuts.push(el.getBoundingClientRect().bottom - sr.top); });
      cuts.sort(function(a,b){ return a-b; });
      return window.html2canvas(sheet, {scale:2, backgroundColor:"#ffffff", useCORS:true, logging:false, windowWidth:sheet.scrollWidth}).then(function(canvas){
        var jsPDF=window.jspdf.jsPDF, pdf=new jsPDF({orientation:"landscape", unit:"mm", format:"a4"});
        var M=10, W=297-2*M, H=210-2*M-6, k=canvas.width/W, pageH=H*k, scale=canvas.height/sr.height;
        var bounds=cuts.map(function(y){ return Math.round(y*scale); }), y=0, pages=[];
        while(y < canvas.height-2){
          var lim=y+pageH, cut=lim;
          if(lim < canvas.height){ var ok=bounds.filter(function(b){ return b>y+pageH*0.35 && b<=lim; }); if(ok.length) cut=ok[ok.length-1]; } else cut=canvas.height;
          pages.push([y, cut]); y=cut;
        }
        pages.forEach(function(pg, i){
          var h=pg[1]-pg[0], part=document.createElement("canvas"); part.width=canvas.width; part.height=h;
          var ctx=part.getContext("2d"); ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,part.width,h); ctx.drawImage(canvas, 0, pg[0], canvas.width, h, 0, 0, canvas.width, h);
          if(i) pdf.addPage();
          pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", M, M, W, h/k);
          pdf.setFontSize(8); pdf.setTextColor(120); pdf.text("PRECISE Risk Management Cockpit  ·  "+(i+1)+" / "+pages.length, 297-M, 210-6, {align:"right"});
        });
        return saveFile("PRECISE_KPI_Register_"+beDate()+".pdf", pdf.output("blob"));
      });
    }).catch(function(){ toast("สร้างไฟล์ PDF ไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่"); })
      .then(function(){
        if(sheet) sheet.remove();
        if(prevTheme===null) root.removeAttribute("data-theme"); else root.setAttribute("data-theme", prevTheme);
        exportBusy("pdf", false);
      });
  }
  document.addEventListener("click", function(e){
    var ex=e.target.closest && e.target.closest("[data-export]"); if(!ex || ex.disabled) return;
    if(ex.getAttribute("data-export")==="xlsx") exportXlsx(); else exportPdf();
  });

  /* ---------------- EDIT: แนวทางจัดการ (prototype — saved in this browser tab only) ---------------- */
  var actEdit = null; // {rid, f:[{name, items:[{text, owner, due, status, pct, log, note}]}]}
  var AE_ST = [["todo","ยังไม่เริ่ม"],["doing","กำลังทำ"],["done","เสร็จ"]];
  function aeRoot(){ var el=document.getElementById("aeRoot"); if(!el){ el=document.createElement("div"); el.id="aeRoot"; document.body.appendChild(el); } return el; }
  function openActEditor(rid){
    var r=RISKS.filter(function(x){ return x.id===rid; })[0]; if(!r) return;
    actEdit={rid:rid, f:r.factors.map(function(f){
      var causes=(f.causes||[]).map(function(t){ return {text:t, items:[]}; }), orphans=[];
      f.responses.forEach(function(t,i){ var a=(f.acts||[])[i]||{};
        var it={text:t, owner:a.owner||r.owner||"", due:a.due||ASOF, status:a.status||"todo", pct:a.pct||"", log:(a.log||[]).slice(), note:""};
        if(a.c!=null && causes[a.c]) causes[a.c].items.push(it); else orphans.push(it); });
      return {name:f.name, causes:causes, orphans:orphans}; }), msg:null, sel:null, open:null};
    renderActEditor(); var first=document.querySelector("#aeRoot textarea"); if(first) first.focus();
  }
  function closeActEditor(){ actEdit=null; aeRoot().innerHTML=""; document.body.style.overflow = selectedRisk ? "hidden" : ""; var b=document.querySelector("[data-act-edit]"); if(b) b.focus(); }
  function aeList(fi, ci){ var f=actEdit.f[fi]; return ci==="o" ? f.orphans : f.causes[+ci].items; }
  function aeItem(key){ var p=key.split(":"); return aeList(+p[0], p[1])[+p[2]]; }
  /* layout: left = ปัจจัย > สาเหตุ (pick one) · right = that cause + its actions as compact rows; one row open for editing */
  function aeSt(it){ if(it.status==="done") return ["done","เสร็จ"]; if(it.due<ASOF) return ["late","ล่าช้า "+dayDiff(ASOF,it.due)+" วัน"]; return it.status==="doing" ? ["doing","กำลังทำ"] : ["todo","ยังไม่เริ่ม"]; }
  function aeSelList(){ var s=actEdit.sel, f=actEdit.f[s.fi]; if(!f) return null; return s.ci==="o" ? f.orphans : (f.causes[s.ci] ? f.causes[s.ci].items : null); }
  function aeFixSel(){ var s=actEdit.sel;
    if(s && actEdit.f[s.fi] && (s.ci==="o" ? actEdit.f[s.fi].orphans.length : actEdit.f[s.fi].causes[s.ci])) return;
    for(var i=0;i<actEdit.f.length;i++){ var f=actEdit.f[i]; if(f.causes.length){ actEdit.sel={fi:i, ci:0}; return; } if(f.orphans.length){ actEdit.sel={fi:i, ci:"o"}; return; } }
    actEdit.sel={fi:0, ci:0}; }
  function aeMoveMenu(id, fi, ci){
    return '<div class="ae2-mvmenu" role="menu" aria-label="ย้ายไปสาเหตุ">'+actEdit.f.map(function(f, x){
      return '<div class="ae2-mvf">'+(x+1)+'. '+esc(f.name)+'</div>'+f.causes.map(function(c, y){ var here=x===fi && String(y)===String(ci);
        return '<button type="button" role="menuitem" class="ae2-mvi'+(here?' here':'')+'"'+(here?' disabled':' data-ae-mvto="'+id+'|'+x+':'+y+'"')+'><span class="n">'+(x+1)+'.'+(y+1)+'</span><span>'+esc(String(c.text).trim()||'สาเหตุใหม่')+'</span>'+(here?'<em>อยู่ที่นี่</em>':'')+'</button>'; }).join('');
    }).join('')+'</div>';
  }
  function aeRowHtml(fi, ci, ai, it){
    var id=fi+':'+ci+':'+ai, k=fi+'-'+ci+'-'+ai, st=aeSt(it), open=actEdit.open===id, last=it.log[it.log.length-1];
    var pill='<span class="act-st ae2-pill '+st[0]+'">'+st[1]+'</span>';
    if(!open){
      var pct=it.status==="doing" && it.pct!=="" ? '<span class="ae2-pct"><span class="ae2-bar"><i style="width:'+Math.max(0,Math.min(100,+it.pct))+'%"></i></span>'+(+it.pct)+'%</span>' : '';
      return '<button type="button" class="ae2-row" data-ae-open="'+id+'" aria-expanded="false">'+pill+
        '<span class="ae2-tx"><span class="ae2-t">'+(String(it.text).trim() ? esc(it.text) : '<em>แนวทางใหม่</em>')+'</span>'+
        '<span class="ae2-m">'+(it.owner?'<span>'+esc(it.owner)+'</span>':'')+'<span>กำหนด '+thDate(it.due)+'</span>'+pct+'</span></span>'+icon("chevd","ae2-chev")+'</button>';
    }
    return '<div class="ae2-open">'+
      '<div class="ae2-top"><label class="sr-only" for="ae-'+k+'-text">แนวทางจัดการ</label><textarea class="ae-in" id="ae-'+k+'-text" data-ae="'+id+':text" rows="1" placeholder="แนวทางจัดการ">'+esc(it.text)+'</textarea>'+
        '<button type="button" class="ae2-fold" data-ae-open="'+id+'" aria-expanded="true" aria-label="ย่อ">'+icon("chevd","ae2-chev up")+'</button></div>'+
      '<div class="ae-grid">'+
        '<label class="ae-f1"><span>ผู้รับผิดชอบ</span><input class="ae-in" id="ae-'+k+'-owner" data-ae="'+id+':owner" value="'+escAttr(it.owner)+'"></label>'+
        '<label class="ae-f1"><span>กำหนดเสร็จ</span><input class="ae-in" type="date" id="ae-'+k+'-due" data-ae="'+id+':due" value="'+escAttr(it.due)+'"></label>'+
        '<div class="ae-f1"><span id="ae-'+k+'-st">สถานะ</span><div class="ae-seg" role="radiogroup" aria-labelledby="ae-'+k+'-st">'+AE_ST.map(function(o){ var on=it.status===o[0]; return '<button type="button" role="radio" aria-checked="'+on+'" class="'+(on?'on':'')+'" data-ae-st="'+id+':'+o[0]+'">'+o[1]+'</button>'; }).join('')+'</div></div>'+
        '<label class="ae-f1 ae-pct"><span>คืบหน้า %</span><input class="ae-in" type="number" min="0" max="100" step="5" id="ae-'+k+'-pct" data-ae="'+id+':pct" value="'+escAttr(it.status==="done"?100:it.pct)+'"'+(it.status==="doing"?'':' disabled')+'></label>'+
      '</div>'+
      '<label class="ae-f1 ae-note"><span>บันทึกความคืบหน้าเดือนนี้'+(last?' <em>ล่าสุด '+thDate(last.d)+' · '+esc(last.note)+'</em>':'')+'</span><input class="ae-in" id="ae-'+k+'-note" data-ae="'+id+':note" value="'+escAttr(it.note)+'" placeholder="เช่น ติดตั้งเครื่องจักรแล้ว 3 จาก 5 เครื่อง"></label>'+
      '<div class="ae2-acts"><button type="button" class="ae2-mv" data-ae-mv="'+id+'" aria-expanded="'+(actEdit.mv===id)+'">'+icon("arrow")+'ย้ายไปสาเหตุอื่น</button><button type="button" class="ae2-del" data-ae-del="'+id+'">ลบแนวทางนี้</button></div>'+
      (actEdit.mv===id ? aeMoveMenu(id, fi, ci) : '')+
    '</div>';
  }
  function renderActEditor(){
    if(!actEdit){ aeRoot().innerHTML=""; return; }
    var r=RISKS.filter(function(x){ return x.id===actEdit.rid; })[0]; aeFixSel(); var s=actEdit.sel;
    function navItem(fi, ci, label, n, items){
      var on=s.fi===fi && String(s.ci)===String(ci), late=items.some(function(it){ return aeSt(it)[0]==="late"; });
      return '<button type="button" class="ae2-ci'+(on?' on':'')+'" data-ae-sel="'+fi+':'+ci+'" aria-current="'+on+'"><span class="n">'+n+'</span><span class="t">'+label+'</span><span class="c'+(late||!items.length?' lt':'')+'">'+items.length+'</span></button>';
    }
    var nav=actEdit.f.map(function(f, fi){
      return '<div class="ae2-fac"><span class="rf-no">'+(fi+1)+'</span><span>'+esc(f.name)+'</span></div>'+
        f.causes.map(function(c, ci){ return navItem(fi, ci, String(c.text).trim() ? esc(c.text) : '<em>สาเหตุใหม่</em>', (fi+1)+'.'+(ci+1), c.items); }).join('')+
        (f.orphans.length ? navItem(fi, "o", '<em>ยังไม่ระบุสาเหตุ</em>', '–', f.orphans) : '')+
        '<button type="button" class="ae2-add c" data-ae-cadd="'+fi+'">'+icon("plus")+'เพิ่มสาเหตุ</button>';
    }).join('');
    var f=actEdit.f[s.fi], list=aeSelList()||[], pane='';
    if(f){
      pane='<div class="ae2-crumb"><span class="rf-no">'+(s.fi+1)+'</span>'+esc(f.name)+'</div>'+
        (s.ci==="o" ? '<div class="ae2-clab"><span class="ae2-ctag">ยังไม่ระบุสาเหตุ</span></div><div class="ae2-hint">คลิกแนวทางแต่ละข้อ แล้วกด “ย้ายไปสาเหตุอื่น”</div>'
          : '<div class="ae2-clab"><span class="ae2-ctag">สาเหตุ '+(s.fi+1)+'.'+(s.ci+1)+'</span><button type="button" class="ae2-lnk" data-ae-cdel="'+s.fi+':'+s.ci+'">ลบสาเหตุ</button></div>'+
            '<label class="sr-only" for="aec-'+s.fi+'-'+s.ci+'">สาเหตุ '+(s.ci+1)+'</label><textarea class="ae2-ctext" id="aec-'+s.fi+'-'+s.ci+'" data-ae-c="'+s.fi+':'+s.ci+'" rows="1" placeholder="พิมพ์สาเหตุ">'+esc(f.causes[s.ci].text)+'</textarea>')+
        '<div class="ae2-sec">แนวทางจัดการ <span class="rf-n">'+list.length+'</span>'+(s.ci==="o"?'':'<button type="button" class="ae2-add" data-ae-add="'+s.fi+':'+s.ci+'">'+icon("plus")+'เพิ่มแนวทางจัดการ</button>')+'</div>'+
        (list.length ? list.map(function(it, ai){ return aeRowHtml(s.fi, s.ci, ai, it); }).join('') : '<div class="ae2-empty">ยังไม่มีแนวทางจัดการสำหรับสาเหตุนี้</div>');
    }
    var msg = actEdit.msg ? '<div class="dl-alert ae2-msg '+(actEdit.msg.err?'crit':'good')+'" role="'+(actEdit.msg.err?'alert':'status')+'">'+icon(actEdit.msg.err?"flag":"check")+'<div><b>'+(actEdit.msg.err?'นำเข้าไม่ได้ · ':'นำเข้าแล้ว · ')+esc(actEdit.msg.file)+'</b>'+actEdit.msg.lines.slice(0,8).map(function(l){ return '<div>'+esc(l)+'</div>'; }).join('')+(actEdit.msg.lines.length>8?'<div>และอีก '+(actEdit.msg.lines.length-8)+' รายการ</div>':'')+'</div></div>' : '';
    aeRoot().innerHTML='<div class="ae-backdrop" data-ae-close="1"><div class="ae-box ae2" role="dialog" aria-modal="true" aria-labelledby="aeTitle">'+
      '<div class="ae-head ae2-head"><div class="ae2-hl"><div class="ae-rid mono">'+r.id+'</div><h3 id="aeTitle">แก้ไขสาเหตุและแนวทางจัดการ</h3><div class="ae-sub">'+esc(r.title)+'</div></div>'+
        '<div class="ae2-tools"><button type="button" class="ra-btn sm" data-ae-tpl="1">'+icon("download")+'แม่แบบ Excel</button>'+
        '<label class="ra-btn sm ae-up">'+icon("upload")+'นำเข้า<input type="file" accept=".xlsx" id="aeXlsx" class="sr-only"></label></div>'+
        '<button type="button" class="modal-close" data-ae-cancel="1" aria-label="ปิด">&times;</button></div>'+
      msg+
      '<div class="ae2-main"><nav class="ae2-nav" aria-label="ปัจจัยและสาเหตุ">'+nav+'</nav><div class="ae-body ae2-pane">'+pane+'</div></div>'+
      '<div class="ae-foot"><span class="ae-hint">บันทึกความคืบหน้าจะลงวันที่ '+thDate(ASOF)+'</span><button type="button" class="ra-btn" data-ae-cancel="1">ยกเลิก</button><button type="button" class="ra-btn" data-ae-save="draft">บันทึกร่าง</button><button type="button" class="ra-btn primary" data-ae-save="submit">'+icon("arrow")+'ส่งให้ Coordinator ตรวจ</button></div>'+
    '</div></div>';
    document.body.style.overflow="hidden";
  }
  function saveActEditor(mode){
    var r=RISKS.filter(function(x){ return x.id===actEdit.rid; })[0]; if(!r) return; var before=r.factors;
    var notes=[], nf=[];
    actEdit.f.forEach(function(ef, fi){
      var causes=[], resp=[], acts=[];
      function push(it, c){ if(!String(it.text).trim()) return;
        var a={due:it.due||ASOF, status:it.status, owner:it.owner}, log=it.log.slice();
        if(c!=null) a.c=c;
        if(it.status==="doing" && it.pct!=="") a.pct=Math.max(0, Math.min(100, +it.pct));
        if(String(it.note).trim()){ log.push({d:ASOF, note:it.note.trim()}); notes.push({t:it.text.trim(), b:it.note.trim()}); }
        if(log.length) a.log=log;
        resp.push(it.text.trim()); acts.push(a); }
      ef.causes.forEach(function(c){ var t=String(c.text).trim();
        if(!t){ c.items.forEach(function(it){ push(it, null); }); return; }
        causes.push(t); c.items.forEach(function(it){ push(it, causes.length-1); }); });
      ef.orphans.forEach(function(it){ push(it, null); });
      nf.push({name:ef.name, causes:causes, responses:resp, acts:acts});
    });
    var sl=structDiff(before, nf);
    r.factors=nf;
    riskEdit(r.id, "factors", r.factors);
    var pf=flowOf(r), f={state: mode==="submit" ? "submitted" : "draft", by:currentUser.name, role:currentUser.role, d:ASOF, files:(pf.files||[]).slice(), acts:true,
      struct: !!(pf.struct || sl.length), structLines:(pf.structLines||[]).concat(sl)};
    setFlow(r, f);
    logAudit(r.id, "act", mode==="submit" ? "ส่งรายงาน "+PERIOD+" ให้ Coordinator ตรวจ (แนวทางจัดการ)" : "บันทึกร่างแนวทางจัดการ "+PERIOD, notes.concat(sl.map(function(t){ return {t:"เปลี่ยนโครงสร้าง", b:t}; })));
    closeActEditor(); rerenderFilterable(); toast(mode==="submit" ? "ส่งรายงานของ "+r.id+" ให้ "+coordName(r)+" ตรวจแล้ว" : "บันทึกร่างแล้ว ยังไม่ส่ง");
  }
  /* การเปลี่ยนโครงสร้าง: เพิ่ม/ลบสาเหตุหรือแนวทาง และเลื่อนกำหนดเสร็จ */
  function structDiff(a, b){ var out=[];
    function acts(fs){ var m={}; fs.forEach(function(f){ f.responses.forEach(function(t, i){ m[t]=(f.acts||[])[i]||{}; }); }); return m; }
    function causes(fs){ var s={}; fs.forEach(function(f){ (f.causes||[]).forEach(function(c){ s[c]=1; }); }); return s; }
    var A=acts(a), B=acts(b), ca=causes(a), cb=causes(b);
    Object.keys(cb).forEach(function(c){ if(!ca[c]) out.push("เพิ่มสาเหตุ: "+c); });
    Object.keys(ca).forEach(function(c){ if(!cb[c]) out.push("ลบสาเหตุ: "+c); });
    Object.keys(B).forEach(function(t){ if(!A[t]) out.push("เพิ่มแนวทาง: "+t); else if(A[t].due && B[t].due && A[t].due!==B[t].due) out.push("เลื่อนกำหนด: "+t+" ("+thDate(A[t].due)+" → "+thDate(B[t].due)+")"); });
    Object.keys(A).forEach(function(t){ if(!B[t]) out.push("ลบแนวทาง: "+t); });
    return out; }
  function applyRiskEdits(){ try{ var ed=JSON.parse(sessionStorage.getItem("prc-risk-edits")||"{}");
    RISKS.forEach(function(r){ var e=ed[r.id]; if(!e) return; if(Array.isArray(e)) e={factors:e};
      if(e.factors) r.factors=e.factors;
      if(e.kris) e.kris.forEach(function(x, i){ var k=r.kris[i]; if(!k) return; k.current=x.current; k.status=x.status; if(x.cur0!=null) k.cur0=x.cur0; k.note=x.note||""; }); }); }catch(err){} }
  (function(){
    var root=aeRoot();
    function newItem(){ var rr=RISKS.filter(function(x){ return x.id===actEdit.rid; })[0]; return {text:"", owner:rr.owner||"", due:ASOF, status:"todo", pct:"", log:[], note:""}; }
    function focusId(id){ var el=document.getElementById(id); if(el){ el.focus(); el.scrollIntoView({block:"nearest"}); } }
    root.addEventListener("input", function(e){ if(!actEdit) return; var t=e.target, c=t.getAttribute("data-ae-c");
      if(c){ var q=c.split(":"); actEdit.f[+q[0]].causes[+q[1]].text=t.value;
        var nt=document.querySelector('#aeRoot [data-ae-sel="'+c+'"] .t'); if(nt) nt.innerHTML=t.value.trim() ? esc(t.value) : '<em>สาเหตุใหม่</em>'; return; }
      var k=t.getAttribute("data-ae"); if(!k) return; var p=k.split(":"); aeItem(k)[p[3]]=t.value; });
    root.addEventListener("change", function(e){ if(!actEdit) return; var t=e.target;
      if(t.id==="aeXlsx" && t.files[0]){ axImport(t.files[0]); return; }
      var k=t.getAttribute("data-ae"); if(k && /:due$/.test(k)){ keepScroll(renderActEditor); focusId(t.id); } });
    root.addEventListener("click", function(e){
      var t, p; if(!actEdit) return;
      if(e.target.closest("[data-ae-cancel]") || (e.target.hasAttribute && e.target.hasAttribute("data-ae-close"))){ closeActEditor(); return; }
      if(e.target.closest("[data-ae-save]")){ saveActEditor(e.target.closest("[data-ae-save]").getAttribute("data-ae-save")); return; }
      if(e.target.closest("[data-ae-tpl]")){ axTemplate(); return; }
      if((t=e.target.closest("[data-ae-sel]"))){ p=t.getAttribute("data-ae-sel").split(":"); actEdit.sel={fi:+p[0], ci:p[1]==="o"?"o":+p[1]}; actEdit.open=null;
        renderActEditor(); var pn=document.querySelector("#aeRoot .ae2-pane"); if(pn) pn.scrollTop=0;
        if(window.innerWidth<=760 && pn){ pn.scrollIntoView({block:"start"}); } else keepNav(t); return; }
      if((t=e.target.closest("[data-ae-open]"))){ var id=t.getAttribute("data-ae-open"); actEdit.open = actEdit.open===id ? null : id; actEdit.mv=null; keepScroll(renderActEditor);
        if(actEdit.open){ p=id.split(":"); focusId("ae-"+p.join("-")+"-text"); } else { var b=document.querySelector('#aeRoot [data-ae-open="'+id+'"]'); if(b) b.focus(); } return; }
      if((t=e.target.closest("[data-ae-st]"))){ p=t.getAttribute("data-ae-st").split(":"); var it=aeList(+p[0],p[1])[+p[2]]; it.status=p[3]; if(p[3]==="doing" && !it.pct) it.pct=10; keepScroll(renderActEditor);
        var sb=document.querySelector('#aeRoot [data-ae-st="'+t.getAttribute("data-ae-st")+'"]'); if(sb) sb.focus(); return; }
      if((t=e.target.closest("[data-ae-add]"))){ p=t.getAttribute("data-ae-add").split(":"); var L=aeList(+p[0],p[1]); L.push(newItem()); actEdit.open=p[0]+":"+p[1]+":"+(L.length-1);
        keepScroll(renderActEditor); focusId("ae-"+p[0]+"-"+p[1]+"-"+(L.length-1)+"-text"); return; }
      if((t=e.target.closest("[data-ae-cadd]"))){ var cf=+t.getAttribute("data-ae-cadd"); actEdit.f[cf].causes.push({text:"", items:[]}); actEdit.sel={fi:cf, ci:actEdit.f[cf].causes.length-1}; actEdit.open=null;
        keepScroll(renderActEditor); focusId("aec-"+cf+"-"+actEdit.sel.ci); var nb=document.querySelector('#aeRoot [data-ae-sel="'+cf+':'+actEdit.sel.ci+'"]'); if(nb) nb.scrollIntoView({block:"nearest"}); return; }
      if((t=e.target.closest("[data-ae-cdel]"))){ p=t.getAttribute("data-ae-cdel").split(":"); var ef=actEdit.f[+p[0]], gone=ef.causes.splice(+p[1],1)[0];
        gone.items.forEach(function(it){ if(String(it.text).trim()) ef.orphans.push(it); });
        actEdit.sel = ef.causes.length ? {fi:+p[0], ci:Math.max(0,+p[1]-1)} : (ef.orphans.length ? {fi:+p[0], ci:"o"} : null); actEdit.open=null;
        keepScroll(renderActEditor); if(gone.items.length) toast("ย้ายแนวทางของสาเหตุที่ลบไปไว้ที่ “ยังไม่ระบุสาเหตุ”"); return; }
      if((t=e.target.closest("[data-ae-mv]"))){ var mid=t.getAttribute("data-ae-mv"); actEdit.mv = actEdit.mv===mid ? null : mid; keepScroll(renderActEditor);
        var mf=document.querySelector("#aeRoot .ae2-mvi:not([disabled])"); if(mf && actEdit.mv){ mf.focus(); mf.scrollIntoView({block:"nearest"}); } return; }
      if((t=e.target.closest("[data-ae-mvto]"))){ var q=t.getAttribute("data-ae-mvto").split("|"), a=q[0].split(":"), to=q[1].split(":"), src=aeList(+a[0],a[1]), mvIt=src.splice(+a[2],1)[0];
        aeList(+to[0],to[1]).push(mvIt); actEdit.open=null; actEdit.mv=null; if(!src.length) actEdit.sel={fi:+to[0], ci:+to[1]};
        keepScroll(renderActEditor); toast("ย้ายไปสาเหตุ "+(+to[0]+1)+"."+(+to[1]+1)+" แล้ว"); return; }
      if((t=e.target.closest("[data-ae-del]"))){ p=t.getAttribute("data-ae-del").split(":"); aeList(+p[0],p[1]).splice(+p[2],1); actEdit.open=null; keepScroll(renderActEditor); return; }
    });
    function keepNav(){ var b=document.querySelector("#aeRoot .ae2-ci.on"); if(b){ b.focus({preventScroll:true}); b.scrollIntoView({block:"nearest"}); } }
  })();
  function keepScroll(fn){
    var b=document.querySelector("#aeRoot .ae-body"), y=b?b.scrollTop:0, n=document.querySelector("#aeRoot .ae2-nav"), ny=n?n.scrollTop:0; fn();
    var b2=document.querySelector("#aeRoot .ae-body"); if(b2) b2.scrollTop=y; var n2=document.querySelector("#aeRoot .ae2-nav"); if(n2) n2.scrollTop=ny; }
  document.addEventListener("click", function(e){ var t=e.target.closest && e.target.closest("[data-act-edit]"); if(t) openActEditor(t.getAttribute("data-act-edit")); });


  /* ---------------- SESSION EDITS (prototype — this browser tab only) ---------------- */
  function sessGet(k, d){ try{ var v=JSON.parse(sessionStorage.getItem(k)||"null"); return v===null ? d : v; }catch(err){ return d; } }
  function sessSet(k, v){ try{ sessionStorage.setItem(k, JSON.stringify(v)); }catch(err){} }
  function riskEdit(rid, part, val){ var ed=sessGet("prc-risk-edits", {}); if(Array.isArray(ed[rid])) ed[rid]={factors:ed[rid]}; ed[rid]=ed[rid]||{}; ed[rid][part]=val; sessSet("prc-risk-edits", ed); }
  function riskById(rid){ return RISKS.filter(function(x){ return x.id===rid; })[0]; }
  function nowHM(){ var d=new Date(); return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2); }
  function logAudit(rid, type, title, lines){ var a=sessGet("prc-audit", []); a.push({d:ASOF, tm:nowHM(), rid:rid, type:type, who:currentUser.name, role:currentUser.role, title:title, lines:lines||[]}); sessSet("prc-audit", a); }
  function seedId(id){ return String(id).replace(/-\d{2}-(\d{2})$/,"-$1"); }
  function kriMd(r, k){ var md=histModel(seedId(r.id)+"|"+k.name, k.appetite, k.tolerance, k.cur0!=null ? k.cur0 : k.current);
    if(k.cur0!=null){ var v=hNum(k.current); if(v!==null){ md.vals[md.vals.length-1]=v; md.hasCur=true; md.ok=true; } } return md; }
  var PERIOD = HIST_MONTHS[HIST_MONTHS.length-1].label, PREV_PERIOD = HIST_MONTHS[HIST_MONTHS.length-2].label;
  function coordName(r){ return "Risk Coordinator "+r.sub; }
  function flowOf(r){ var f=sessGet("prc-kri-flow", {})[r.id]; if(f) return f;
    if(!r.kris.length) return {state:"none"};
    var sub = r.id==="PSL-SR-69-01" || hSeed(seedId(r.id)+"flow")()<0.12;
    return sub ? {state:"submitted", by:r.owner, role:"owner", d:ASOF.slice(0,8)+"15", files:[r.sub+"_KRI_"+PERIOD.replace(" ","")+".xlsx"]}
               : {state:"confirmed", by:r.owner, role:"owner", d:ASOF.slice(0,8)+"12", cby:coordName(r), cd:ASOF.slice(0,8)+"14", files:[r.sub+"_KRI_"+PERIOD.replace(" ","")+".xlsx"]}; }
  function setFlow(r, f){ var all=sessGet("prc-kri-flow", {}); all[r.id]=f; sessSet("prc-kri-flow", all); }
  var FLOW_LBL = {draft:"ร่าง ยังไม่ส่ง", submitted:"รอ Coordinator ตรวจ", returned:"ส่งกลับแก้ไข", confirmed:"ส่งส่วนกลางแล้ว"};
  var FLOW_CLS = {draft:"pending", submitted:"watch", returned:"crit", confirmed:"good"};
  function flowPill(r){ var f=flowOf(r); if(f.state==="none") return ''; return '<span class="flow-st '+FLOW_CLS[f.state]+'" title="รายงานประจำเดือน = ค่า KRI + ความคืบหน้าแนวทางจัดการ">รายงาน '+PERIOD+' · '+FLOW_LBL[f.state]+(f.struct?' · เปลี่ยนโครงสร้าง':'')+'</span>'; }

  /* ---------------- DIALOGS: KRI update · KRI confirm · Audit Trail · invite user ---------------- */
  var dlg = null, dlgOpener = null;
  function dlgShell(o){
    return '<div class="ae-backdrop" data-ae-close="1"><div class="ae-box'+(o.cls?' '+o.cls:'')+'" role="dialog" aria-modal="true" aria-labelledby="aeTitle">'+
      '<div class="ae-head'+(o.tools?' ae2-head':'')+'"><div class="ae2-hl">'+(o.rid?'<div class="ae-rid mono">'+o.rid+'</div>':'')+'<h3 id="aeTitle">'+o.title+'</h3>'+(o.sub?'<div class="ae-sub">'+o.sub+'</div>':'')+'</div>'+(o.tools?'<div class="ae2-tools">'+o.tools+'</div>':'')+
        '<button type="button" class="modal-close" data-ae-cancel="1" aria-label="ปิด">&times;</button></div>'+
      '<div class="ae-body">'+o.body+'</div>'+
      '<div class="ae-foot">'+(o.hint?'<span class="ae-hint">'+o.hint+'</span>':'')+o.foot+'</div></div></div>';
  }
  function openDlg(d, opener){ dlg=d; dlgOpener=opener||null; renderDlg(); document.body.style.overflow="hidden";
    var f=document.querySelector("#aeRoot .ae-body input:not([disabled]), #aeRoot .ae-body textarea, #aeRoot .ae-body select, #aeRoot .ae-body button"); if(f) f.focus(); }
  function closeDlg(){ dlg=null; aeRoot().innerHTML=""; document.body.style.overflow = selectedRisk ? "hidden" : ""; if(dlgOpener && document.body.contains(dlgOpener)) dlgOpener.focus(); dlgOpener=null; }
  function renderDlg(){ if(!dlg){ aeRoot().innerHTML=""; return; }
    aeRoot().innerHTML = ({kri:dlgKri, confirm:dlgConfirm, audit:dlgAudit, invite:dlgInvite, profile:dlgProfile, rmcdec:dlgRmcDec})[dlg.kind](); }
  function kriLine(r, k){ return '<span class="kc-name">'+(k.f?'<span class="rf-no">'+k.f+'</span>':'<span class="rf-no all">รวม</span>')+esc(k.name)+'</span>'; }

  /* อัปเดตค่า KRI */
  function openKri(rid, opener){ var r=riskById(rid); if(!r) return;
    var f=flowOf(r);
    openDlg({kind:"kri", rid:rid, rows:r.kris.map(function(k){ var md=kriMd(r,k), n=md.vals.length, dm=/\(([^)]*)\)/.exec(k.current||"");
      var v0=hNum(k.current)!==null ? String(hNum(k.current)) : "", d0=dm ? dm[1] : "";
      return {v:v0, detail:d0, v0:v0, d0:d0, note: k.note||"", md:md, prev: md.ok ? md.vals[n-2] : null}; }),
      files:(f.files||[]).slice(), err:"", msg:null}, opener); }
  function kcAnyCrit(){ return dlg.rows.some(function(row){ return kriRowSt(row)==="crit"; }); }
  function kcFilesLbl(){ return 'หลักฐานที่มาของตัวเลข <em>เช่น รายงานจาก ERP หรือใบบันทึกหน้างาน</em>'+(kcAnyCrit() ? ' <b class="ae-late">จำเป็น เพราะมี KRI เกิน Tolerance</b>' : ' <em>· ไม่บังคับ</em>'); }
  function kriRowSt(row){ var v=row.v===""?null:+row.v; return v===null || isNaN(v) ? "pending" : hStatus(row.md, v); }
  function dlgKri(){ var r=riskById(dlg.rid), f=flowOf(r), canCf=can("ตรวจค่า KRI ก่อนส่งส่วนกลาง", r);
    var body = dlgMsg(dlg.msg)+(f.state==="returned" ? '<div class="dl-alert crit">'+icon("flag")+'<div><b>ส่งกลับแก้ไขโดย '+esc(f.rby||r.owner)+' · '+thDate(f.rd||ASOF)+'</b>'+esc(f.rnote||"")+'</div></div>' : '')+
      '<div class="kc-list">'+r.kris.map(function(k, i){ var row=dlg.rows[i], st=kriRowSt(row), u=row.md.unit;
        return '<div class="kc-item '+st+'">'+
          '<div class="kc-top">'+kriLine(r,k)+'<span class="kc-thr mono">Appetite '+esc(k.appetite||"—")+' · Tolerance '+esc(k.tolerance||"—")+'</span></div>'+
          (k.calc?'<div class="kc-calc">วิธีวัด: '+esc(k.calc)+'</div>':'')+
          '<div class="kc-grid">'+
            '<div class="ae-f1"><span>เดือนก่อน · '+PREV_PERIOD+'</span><div class="kc-prev mono">'+(row.prev===null?'—':hFmt(row.prev,u))+'</div></div>'+
            '<label class="ae-f1"><span>เดือนนี้ · '+PERIOD+'</span><span class="kc-inw"><input class="ae-in mono" type="number" step="any" id="kc-'+i+'-v" data-kc="'+i+':v" value="'+escAttr(row.v)+'">'+(u?'<i>'+esc(u)+'</i>':'')+'</span></label>'+
            '<label class="ae-f1"><span>ตัวเลขที่ใช้คำนวณ</span><input class="ae-in" id="kc-'+i+'-d" data-kc="'+i+':detail" value="'+escAttr(row.detail)+'" placeholder="เช่น 14 จาก 100"></label>'+
            '<div class="ae-f1"><span>สถานะ</span><div class="kc-st" id="kc-'+i+'-st">'+statusPill(st)+'</div></div>'+
          '</div>'+
          '<label class="ae-f1 kc-note"'+(st==="crit"||row.note?'':' hidden')+' id="kc-'+i+'-nw"><span>สาเหตุที่เกิน Tolerance และสิ่งที่จะทำ'+(st==="crit"?' <b class="ae-late">จำเป็น</b>':'')+'</span><textarea class="ae-in" rows="2" id="kc-'+i+'-n" data-kc="'+i+':note" placeholder="เช่น เครื่องจักรชุดที่ 2 ติดตั้งล่าช้า คาดว่าเสร็จ ต.ค. 69">'+esc(row.note)+'</textarea></label>'+
        '</div>'; }).join('')+'</div>'+
      '<div class="kc-files"><div class="ae-f1"><span id="kcFilesLbl">'+kcFilesLbl()+'</span></div>'+
        dlg.files.map(function(fn, j){ return '<span class="kc-file">'+icon("clipboard")+esc(fn)+'<button type="button" data-kc-rmf="'+j+'" aria-label="เอาไฟล์ '+escAttr(fn)+' ออก">&times;</button></span>'; }).join('')+
        '<label class="ae-add kc-up">'+icon("upload")+'แนบไฟล์<input type="file" multiple id="kcFile" class="sr-only"></label></div>'+
      (dlg.err?'<div class="dl-err" role="alert">'+esc(dlg.err)+'</div>':'');
    return dlgShell({rid:r.id, title:"อัปเดตค่า KRI · "+PERIOD, sub:esc(r.title), cls:"wide", body:body,
      tools:'<button type="button" class="ra-btn sm" data-kx-tpl="1">'+icon("download")+'แม่แบบ Excel</button><label class="ra-btn sm ae-up">'+icon("upload")+'นำเข้า<input type="file" accept=".xlsx" id="kxXlsx" class="sr-only"></label>',
      hint:'ค่าจะขึ้นกราฟทันทีที่บันทึก',
      foot:'<button type="button" class="ra-btn" data-ae-cancel="1">ยกเลิก</button><button type="button" class="ra-btn" data-kc-save="draft">บันทึกร่าง</button>'+
        '<button type="button" class="ra-btn primary" data-kc-save="'+(canCf?'confirm':'submit')+'">'+icon(canCf?"check":"arrow")+(canCf?'บันทึกและส่งส่วนกลาง':'ส่งให้ Coordinator ตรวจ')+'</button>'});
  }
  function saveKri(mode){ var r=riskById(dlg.rid), lines=[];
    if(mode!=="draft"){
      var miss=dlg.rows.some(function(row){ return row.v===""; }), noNote=dlg.rows.some(function(row){ return kriRowSt(row)==="crit" && !String(row.note).trim(); });
      if(miss){ dlg.err="กรอกค่าให้ครบทุก KRI ก่อนส่ง"; keepScroll(renderDlg); return; }
      if(noNote){ dlg.err="KRI ที่เกิน Tolerance ต้องมีคำอธิบาย"; keepScroll(renderDlg); return; }
      if(!dlg.files.length && kcAnyCrit()){ dlg.err="มี KRI เกิน Tolerance ต้องแนบหลักฐานที่มาของตัวเลขอย่างน้อย 1 ไฟล์"; keepScroll(renderDlg); return; }
    }
    r.kris.forEach(function(k, i){ var row=dlg.rows[i]; if(row.v==="") return; var v=+row.v, u=row.md.unit;
      var s=(row.v===row.v0 && row.detail===row.d0) ? k.current : hFmt(v,u)+(String(row.detail).trim()?' ('+row.detail.trim()+')':'');
      if(s!==k.current) lines.push({t:k.name, a:k.current, b:s});
      if(k.cur0==null) k.cur0=k.current; k.current=s; k.status=hStatus(row.md, v); k.note=String(row.note).trim(); });
    riskEdit(r.id, "kris", r.kris.map(function(k){ return {current:k.current, status:k.status, cur0:k.cur0, note:k.note}; }));
    var st = mode==="draft" ? "draft" : mode==="confirm" ? "confirmed" : "submitted";
    var pf=flowOf(r), f={state:st, by:currentUser.name, role:currentUser.role, d:ASOF, files:dlg.files.slice(), acts:pf.acts, struct:pf.struct, structLines:pf.structLines}; if(st==="confirmed"){ f.cby=currentUser.name; f.cd=ASOF; }
    setFlow(r, f);
    logAudit(r.id, "kri", mode==="draft"?"บันทึกร่างค่า KRI "+PERIOD : mode==="confirm"?"บันทึกค่า KRI "+PERIOD+" และส่ง Risk ส่วนกลาง" : "ส่งค่า KRI "+PERIOD+" ให้ Coordinator ตรวจ", lines);
    closeDlg(); rerenderFilterable();
    toast(mode==="draft" ? "บันทึกร่างแล้ว ยังไม่ส่ง" : mode==="confirm" ? "ส่งค่า KRI ของ "+r.id+" ให้ Risk ส่วนกลางแล้ว" : "ส่งค่า KRI ให้ "+coordName(r)+" ตรวจแล้ว");
  }

  /* ตรวจค่า KRI (Risk Coordinator) */
  function openConfirm(rid, opener){ openDlg({kind:"confirm", rid:rid, note:"", err:""}, opener); }
  function dlgConfirm(){ var r=riskById(dlg.rid), f=flowOf(r), wait=f.state==="submitted";
    var head = wait ? '<div class="dl-alert watch">'+icon("history")+'<div><b>ส่งโดย '+esc(f.by)+' · '+thDate(f.d)+'</b>ตรวจค่าและหลักฐาน แล้วส่งให้ Risk ส่วนกลาง หรือส่งกลับให้ Risk Owner แก้ไข</div></div>'
      : '<div class="dl-alert '+FLOW_CLS[f.state]+'">'+icon(f.state==="confirmed"?"check":"flag")+'<div><b>'+(f.state==="confirmed" ? 'ตรวจแล้ว ส่งส่วนกลางโดย '+esc(f.cby||coordName(r))+' · '+thDate(f.cd||f.d) : f.state==="returned" ? 'ส่งกลับแก้ไขแล้ว รอ Risk Owner ส่งใหม่' : 'ยังไม่มีค่าที่ส่งมารอตรวจ')+'</b></div></div>';
    var tbl = '<div class="tbl-wrap"><table class="cf-tbl"><thead><tr><th>KRI</th><th>เดือนก่อน · '+PREV_PERIOD+'</th><th>เดือนนี้ · '+PERIOD+'</th><th>สถานะ</th><th>Appetite · Tolerance</th></tr></thead><tbody>'+
      r.kris.map(function(k){ var md=kriMd(r,k), n=md.vals.length, prev=md.ok?md.vals[n-2]:null;
        return '<tr><td>'+kriLine(r,k)+(k.note?'<div class="cf-note">'+esc(k.note)+'</div>':'')+'</td><td class="mono">'+(prev===null?'—':hFmt(prev,md.unit))+'</td><td class="mono"><b>'+esc(k.current||"—")+'</b></td><td>'+statusPill(k.status)+'</td><td class="mono cf-thr">'+esc(k.appetite||"—")+' · '+esc(k.tolerance||"—")+'</td></tr>'; }).join('')+
      '</tbody></table></div>';
    var files = (f.files&&f.files.length) ? '<div class="kc-files"><div class="ae-f1"><span>หลักฐานที่มาของตัวเลข</span></div>'+f.files.map(function(fn){ return '<span class="kc-file">'+icon("clipboard")+esc(fn)+'</span>'; }).join('')+'</div>' : '';
    var note = wait ? '<label class="ae-f1 kc-note"><span>ความเห็น <em>จำเป็นเมื่อส่งกลับแก้ไข</em></span><textarea class="ae-in" rows="2" id="cfNote" data-cf-note="1">'+esc(dlg.note)+'</textarea></label>'+(dlg.err?'<div class="dl-err" role="alert">'+esc(dlg.err)+'</div>':'') : '';
    var mon=ASOF.slice(0,7), upd=[]; r.factors.forEach(function(fc){ (fc.acts||[]).forEach(function(a, i){ var l=(a.log||[]).filter(function(x){ return x.d.slice(0,7)===mon; }); if(l.length) upd.push({t:fc.responses[i], a:a, n:l[l.length-1].note}); }); });
    var acts='<h4 class="cf-h">แนวทางจัดการที่อัปเดตเดือนนี้ <span class="rf-n">'+upd.length+'</span></h4>'+
      (f.struct && (f.structLines||[]).length ? '<div class="dl-alert watch">'+icon("flag")+'<div><b>เปลี่ยนโครงสร้าง '+f.structLines.length+' รายการ</b>'+f.structLines.map(function(t){ return '<div>'+esc(t)+'</div>'; }).join('')+'</div></div>' : '')+
      (upd.length ? '<ul class="cf-acts">'+upd.map(function(u){ var st=actState(u.a); return '<li><span class="act-st '+st+'">'+({done:"เสร็จ",late:"ล่าช้า",doing:"กำลังทำ",todo:"ยังไม่เริ่ม"})[st]+'</span><div><div>'+esc(u.t)+'</div><div class="cf-an">'+esc(u.n)+'</div></div></li>'; }).join('')+'</ul>' : '<div class="ov-none">ไม่มีแนวทางที่อัปเดตเดือนนี้</div>');
    return dlgShell({rid:r.id, title:"ตรวจรายงานประจำเดือน · "+PERIOD, sub:esc(r.title), cls:"wide", body:head+'<h4 class="cf-h">ค่า KRI</h4>'+tbl+files+acts+note,
      foot: wait ? '<button type="button" class="ra-btn" data-ae-cancel="1">ยกเลิก</button><button type="button" class="ra-btn" data-cf="return">'+icon("flag")+'ส่งกลับแก้ไข</button><button type="button" class="ra-btn primary" data-cf="ok">'+icon("check")+'ตรวจแล้ว ส่งส่วนกลาง</button>'
        : '<button type="button" class="ra-btn" data-ae-cancel="1">ปิด</button>'});
  }
  function saveConfirm(ok){ var r=riskById(dlg.rid), f=flowOf(r), n=String(dlg.note).trim();
    if(!ok && !n){ dlg.err="ใส่ความเห็นว่าต้องแก้อะไร"; keepScroll(renderDlg); var t=document.getElementById("cfNote"); if(t) t.focus(); return; }
    if(ok){ f.state="confirmed"; f.cby=currentUser.name; f.cd=ASOF; } else { f.state="returned"; f.rby=currentUser.name; f.rd=ASOF; f.rnote=n; }
    setFlow(r, f); logAudit(r.id, "kri", ok ? "ตรวจค่า KRI "+PERIOD+" แล้ว ส่ง Risk ส่วนกลาง" : "ส่งค่า KRI "+PERIOD+" กลับให้ Risk Owner แก้ไข", n ? [{t:"ความเห็น", b:n}] : []);
    closeDlg(); rerenderFilterable(); toast(ok ? "ส่งค่า KRI ของ "+r.id+" ให้ Risk ส่วนกลางแล้ว" : "ส่งกลับให้ "+f.by+" แก้ไขแล้ว");
  }

  /* Audit Trail */
  var AUD_T = [["all","ทั้งหมด"],["kri","KRI"],["act","แนวทางจัดการ"],["risk","ข้อมูลความเสี่ยง"]];
  var TH_FULL = {"ม.ค.":1,"ก.พ.":2,"มี.ค.":3,"เม.ย.":4,"พ.ค.":5,"มิ.ย.":6,"ก.ค.":7,"ส.ค.":8,"ก.ย.":9,"ต.ค.":10,"พ.ย.":11,"ธ.ค.":12};
  function auditEntries(r){
    var out=[], coord=coordName(r), n=HIST_MONTHS.length, rnd=hSeed(seedId(r.id)+"aud");
    function hm(){ return ("0"+(8+Math.floor(rnd()*9))).slice(-2)+":"+("0"+Math.floor(rnd()*60)).slice(-2); }
    // KRI: coordinator updates, owner confirms — last 3 closed months + current month's flow
    var mds=r.kris.map(function(k){ return kriMd(r,k); });
    for(var m=n-4; m<=n-2; m++){ var lbl=HIST_MONTHS[m].label, mo=(m-(n-1))+(+ASOF.slice(5,7)), y=+ASOF.slice(0,4); if(mo<1){ mo+=12; y--; }
      // report for month m is entered early next month
      var em=mo+1, ey=y; if(em>12){ em=1; ey++; } var ed=function(day){ return ey+"-"+("0"+em).slice(-2)+"-"+day; };
      var ln=r.kris.map(function(k,i){ var md=mds[i]; return md.ok ? {t:k.name, a:m>0?hFmt(md.vals[m-1],md.unit):"—", b:hFmt(md.vals[m],md.unit)} : null; }).filter(Boolean);
      if(!ln.length) continue;
      out.push({d:ed("0"+(8+Math.floor(rnd()*3))), tm:hm(), type:"kri", who:r.owner, role:"owner", title:"ส่งค่า KRI "+lbl+" ให้ Coordinator ตรวจ", lines:ln});
      out.push({d:ed(String(12+Math.floor(rnd()*3))), tm:hm(), type:"kri", who:coord, role:"coord", title:"ตรวจค่า KRI "+lbl+" แล้ว ส่ง Risk ส่วนกลาง", lines:[]});
    }
    var f=flowOf(r), sess=sessGet("prc-audit", []).some(function(a){ return a.rid===r.id && a.type==="kri"; });
    if(!sess && f.state!=="none"){
      out.push({d:f.d, tm:hm(), type:"kri", who:f.by, role:f.role||"owner", title:"ส่งค่า KRI "+PERIOD+" ให้ Coordinator ตรวจ", lines:r.kris.map(function(k,i){ var md=mds[i]; return md.ok ? {t:k.name, a:hFmt(md.vals[n-2],md.unit), b:k.current} : null; }).filter(Boolean)});
      if(f.state==="confirmed") out.push({d:f.cd, tm:hm(), type:"kri", who:f.cby, role:"coord", title:"ตรวจค่า KRI "+PERIOD+" แล้ว ส่ง Risk ส่วนกลาง", lines:[]});
    }
    // treatment progress logs
    r.factors.forEach(function(fc){ (fc.acts||[]).forEach(function(a, i){ (a.log||[]).forEach(function(l, j){
      var last = j===a.log.length-1;
      out.push({d:l.d, tm:hm(), type:"act", who:a.owner||r.owner, role:"owner", title: last && a.status==="done" ? "ปิดแนวทางจัดการ — เสร็จ" : "บันทึกความคืบหน้าแนวทางจัดการ", lines:[{t:fc.responses[i], b:l.note}]}); }); }); });
    // มติ / revision ที่บันทึกไว้ (ไม่รวมที่เพิ่งบันทึกในรอบนี้ ซึ่งอยู่ใน prc-audit แล้ว)
    var sessRev=sessGet("prc-rmc-dec", []);
    REV.forEach(function(c){ if(c.rid!==r.id || c.t==="new" || c.t==="close" || sessRev.indexOf(c)!==-1 || sessRev.some(function(x){ return x.p===c.p && x.rid===c.rid && x.t===c.t && String(x.b)===String(c.b); })) return;
      var lv=c.t==="LI"||c.t==="base"||c.t==="target";
      out.push({d:c.p+"-17", tm:"16:30", type:"risk", who:c.by||"Risk Management PCC", role:"admin", title:c.t==="LI"?"ปรับระดับความเสี่ยง":c.t==="base"?"ปรับ Baseline":c.t==="target"?"ปรับ Target":c.t==="app"?"ปรับ Appetite":c.t==="tol"?"ปรับ Tolerance":c.t==="owner"?"เปลี่ยน Risk Owner":c.t==="factor_add"?"เพิ่มปัจจัยเสี่ยง":"ตัด KRI",
        lines:[lv?{t:"L×I", a:c.a.join("×"), b:c.b.join("×")}:(c.a!=null&&c.b!=null?{t:c.k||"", a:String(c.a), b:String(c.b)}:{t:c.k||""})].concat(c.note?[{t:"เหตุผล", b:c.note}]:[])}); });
    // risk record
    if(r.rmc){ var mm=/(\d{1,2}) (\S+) (\d{4})/.exec(r.rmc);
      if(mm && TH_FULL[mm[2]]) out.push({d:(+mm[3]-543)+"-"+("0"+TH_FULL[mm[2]]).slice(-2)+"-"+("0"+mm[1]).slice(-2), tm:"16:30", type:"risk", who:"Risk Management PCC", role:"admin", title:"บันทึกมติคณะกรรมการฯ", lines:[{b:r.rmc.replace(/^มติ RMC [^:]*:\s*/,"")}]}); }
    out.push({d:"2025-04-01", tm:"10:05", type:"risk", who:"Risk Management PCC", role:"admin", title:"เพิ่มความเสี่ยงเข้าทะเบียน", lines:[{t:"ระดับความเสี่ยง", b:r.level+" ("+r.L+"×"+r.I+")"},{t:"Risk Owner", b:r.owner}]});
    sessGet("prc-audit", []).forEach(function(a){ if(a.rid===r.id) out.push(a); });
    out.forEach(function(e,i){ e._i=i; });
    return out.sort(function(a,b){ return (b.d+b.tm).localeCompare(a.d+a.tm) || b._i-a._i; });
  }
  function openAudit(rid, opener){ openDlg({kind:"audit", rid:rid, f:"all"}, opener); }
  function dlgAudit(){ var r=riskById(dlg.rid), all=auditEntries(r);
    var cnt={all:all.length}; all.forEach(function(e){ cnt[e.type]=(cnt[e.type]||0)+1; });
    var list=all.filter(function(e){ return dlg.f==="all" || e.type===dlg.f; });
    var chips='<div class="au-chips" role="group" aria-label="กรองประเภท">'+AUD_T.map(function(t){ return '<button type="button" class="au-chip'+(dlg.f===t[0]?' on':'')+'" aria-pressed="'+(dlg.f===t[0])+'" data-au-f="'+t[0]+'">'+t[1]+'<span class="rf-n">'+(cnt[t[0]]||0)+'</span></button>'; }).join('')+'</div>';
    var rows='<ol class="au-list">'+list.map(function(e){ return auditItemHtml(e, false); }).join('')+'</ol>';
    return dlgShell({rid:r.id, title:"Audit Trail", sub:esc(r.title), cls:"wide", body:chips+rows,
      hint:'บันทึกอัตโนมัติ แก้ไขหรือลบไม่ได้', foot:'<button type="button" class="ra-btn" data-ae-cancel="1">ปิด</button>'});
  }
  function auditItemHtml(e, showRid){ var ro=ROLES[e.role]||{};
      return '<li class="au-item"><div class="au-when"><b>'+thDate(e.d)+'</b><span class="mono">'+e.tm+'</span></div>'+
        '<span class="au-dot" style="background:'+(ro.color||'var(--ink-faint)')+'" aria-hidden="true"></span>'+
        '<div class="au-what"><div class="au-title">'+(showRid?'<button type="button" class="au-rid mono" data-risk="'+e.rid+'">'+e.rid+'</button>':'')+esc(e.title)+'<span class="au-type t-'+e.type+'">'+({kri:"KRI",act:"แนวทางจัดการ",risk:"ข้อมูลความเสี่ยง"})[e.type]+'</span></div>'+
        '<div class="au-who">'+esc(e.who)+' · '+esc(ro.label||"")+'</div>'+
        (e.lines&&e.lines.length ? '<ul class="au-lines">'+e.lines.map(function(l){ return '<li>'+(l.t?'<span class="au-k">'+esc(l.t)+'</span>':'')+(l.a!=null?'<span class="mono au-a">'+esc(l.a)+'</span><span class="au-arr" aria-label="เป็น">→</span>':'')+'<span class="'+(l.a!=null?'mono au-b':'au-txt')+'">'+esc(l.b)+'</span></li>'; }).join('')+'</ul>' : '')+
        '</div></li>';
  }

  /* เชิญผู้ใช้ */
  function openInvite(opener){ openDlg({kind:"invite", email:"", name:"", role:"coord", sub:"PEM", risks:[], err:""}, opener); }
  function dlgInvite(){ var d=dlg;
    var roles='<div class="iv-roles" role="radiogroup" aria-label="บทบาท">'+ROLE_ORDER.map(function(k){ var ro=ROLES[k], on=d.role===k;
      return '<button type="button" role="radio" aria-checked="'+on+'" class="iv-role'+(on?' on':'')+'" data-iv-role="'+k+'"><span class="role-ic" style="background:'+ro.color+'">'+icon(ro.icon)+'</span><span><b>'+esc(ro.label)+'</b><small>'+esc(ro.sub)+'</small></span></button>'; }).join('')+'</div>';
    var scope;
    if(d.role==="coord" || d.role==="owner"){
      scope='<label class="ae-f1"><span>บริษัท</span><select class="ae-in" id="ivSub" data-iv="sub">'+PRC.SUBS.map(function(s){ return '<option value="'+s.id+'"'+(s.id===d.sub?' selected':'')+'>'+s.id+' · '+esc(s.th)+'</option>'; }).join('')+'</select></label>';
      if(d.role==="owner"){ var rs=RISKS.filter(function(x){ return x.sub===d.sub; });
        scope+='<div class="ae-f1 iv-risks"><span>ความเสี่ยงที่เป็นเจ้าของ</span>'+(rs.length ? rs.map(function(x){ var on=d.risks.indexOf(x.id)!==-1;
          return '<label class="iv-risk"><input type="checkbox" data-iv-risk="'+x.id+'"'+(on?' checked':'')+'><span class="mono">'+x.id+'</span><span>'+esc(x.title)+'</span></label>'; }).join('') : '<div class="iv-none">ยังไม่มีความเสี่ยงของบริษัทนี้ในทะเบียน</div>')+'</div>'; }
    } else scope='<div class="iv-all">'+icon("eye")+esc(ROLES[d.role].scopeText)+'</div>';
    var body='<div class="iv-grid"><label class="ae-f1"><span>อีเมล</span><input class="ae-in" type="email" id="ivEmail" data-iv="email" value="'+escAttr(d.email)+'" placeholder="name@precise.co.th" autocomplete="off"></label>'+
      '<label class="ae-f1"><span>ชื่อ-นามสกุล</span><input class="ae-in" id="ivName" data-iv="name" value="'+escAttr(d.name)+'"></label></div>'+
      '<div class="ae-f1 iv-sec"><span>บทบาท</span></div>'+roles+
      '<div class="ae-f1 iv-sec"><span>ขอบเขตข้อมูล</span></div>'+scope+
      (d.err?'<div class="dl-err" role="alert">'+esc(d.err)+'</div>':'');
    return dlgShell({title:"เชิญผู้ใช้", sub:"ผู้ใช้จะได้อีเมลเพื่อเข้าสู่ระบบด้วยบัญชีบริษัท", body:body,
      foot:'<button type="button" class="ra-btn" data-ae-cancel="1">ยกเลิก</button><button type="button" class="ra-btn primary" data-iv-send="1">'+icon("arrow")+'ส่งคำเชิญ</button>'});
  }
  function sendInvite(){ var d=dlg;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())){ d.err="ใส่อีเมลให้ถูกต้อง"; keepScroll(renderDlg); document.getElementById("ivEmail").focus(); return; }
    if(!d.name.trim()){ d.err="ใส่ชื่อผู้ใช้"; keepScroll(renderDlg); document.getElementById("ivName").focus(); return; }
    if(d.role==="owner" && !d.risks.length){ d.err="เลือกความเสี่ยงที่เป็นเจ้าของอย่างน้อย 1 รายการ"; keepScroll(renderDlg); return; }
    var demo = d.role==="coord" ? "บริษัทย่อย "+d.sub : d.role==="owner" ? "เจ้าของ "+d.risks.join(", ") : ROLES[d.role].scopeText;
    var nm=d.name.trim(), ini=d.email.trim().replace(/[^a-z]/gi,"").slice(0,2).toUpperCase();
    var inv=sessGet("prc-invites", []); inv.push({email:d.email.trim(), name:nm, initials:ini, role:d.role, demo:demo, d:ASOF}); sessSet("prc-invites", inv);
    var em=d.email.trim(); closeDlg(); build(); toast("ส่งคำเชิญไปที่ "+em+" แล้ว");
  }
  function invitedRows(){ return sessGet("prc-invites", []).map(function(u){
    return '<tr><td><span style="display:inline-flex;align-items:center;gap:8px;">'+avatarHtml(u)+'<span>'+esc(u.name)+'<span class="iv-mail">'+esc(u.email)+'</span></span></span></td><td>'+esc(ROLES[u.role].label)+' <span style="color:var(--ink-faint);font-size:12.5px;">· '+esc(ROLES[u.role].sub)+'</span></td><td>'+esc(u.demo)+'</td><td><span class="pill watch">รอตอบรับ</span></td></tr>'; }).join(''); }

  (function(){
    var root=aeRoot();
    root.addEventListener("input", function(e){ if(!dlg) return; var t=e.target, k;
      if((k=t.getAttribute("data-kc"))){ var p=k.split(":"), row=dlg.rows[+p[0]]; row[p[1]]=t.value;
        if(p[1]==="v"){ var st=kriRowSt(row), i=p[0]; document.getElementById("kc-"+i+"-st").innerHTML=statusPill(st);
          var item=t.closest(".kc-item"); item.className="kc-item "+st;
          var nw=document.getElementById("kc-"+i+"-nw"); nw.hidden = !(st==="crit" || row.note);
          nw.querySelector("span").innerHTML='สาเหตุที่เกิน Tolerance และสิ่งที่จะทำ'+(st==="crit"?' <b class="ae-late">จำเป็น</b>':'');
          var fl=document.getElementById("kcFilesLbl"); if(fl) fl.innerHTML=kcFilesLbl(); } return; }
      if(t.hasAttribute("data-cf-note")){ dlg.note=t.value; return; }
      if((k=t.getAttribute("data-iv")) && k!=="sub"){ dlg[k]=t.value; return; }
    });
    root.addEventListener("change", function(e){ if(!dlg) return; var t=e.target;
      if(t.id==="kxXlsx" && t.files[0]){ kxImport(t.files[0]); return; }
      if(t.id==="kcFile"){ Array.prototype.forEach.call(t.files, function(f){ dlg.files.push(f.name); }); dlg.err=""; keepScroll(renderDlg); return; }
      if(t.hasAttribute("data-iv-risk")){ var id=t.getAttribute("data-iv-risk"), i=dlg.risks.indexOf(id); if(t.checked && i===-1) dlg.risks.push(id); if(!t.checked && i!==-1) dlg.risks.splice(i,1); return; }
      if(t.getAttribute("data-iv")==="sub"){ dlg.sub=t.value; dlg.risks=[]; keepScroll(renderDlg); }
    });
    root.addEventListener("click", function(e){ if(!dlg) return; var t;
      if(e.target.closest("[data-ae-cancel]") || (e.target.hasAttribute && e.target.hasAttribute("data-ae-close"))){ closeDlg(); return; }
      if(e.target.closest("[data-kx-tpl]")){ kxTemplate(); return; }
      if((t=e.target.closest("[data-kc-save]"))){ saveKri(t.getAttribute("data-kc-save")); return; }
      if((t=e.target.closest("[data-kc-rmf]"))){ dlg.files.splice(+t.getAttribute("data-kc-rmf"),1); keepScroll(renderDlg); return; }
      if((t=e.target.closest("[data-cf]"))){ saveConfirm(t.getAttribute("data-cf")==="ok"); return; }
      if((t=e.target.closest("[data-au-f]"))){ dlg.f=t.getAttribute("data-au-f"); keepScroll(renderDlg); var b=document.querySelector('[data-au-f="'+dlg.f+'"]'); if(b) b.focus(); return; }
      if((t=e.target.closest("[data-iv-role]"))){ dlg.role=t.getAttribute("data-iv-role"); dlg.risks=[]; dlg.err=""; keepScroll(renderDlg); var b2=document.querySelector('[data-iv-role="'+dlg.role+'"]'); if(b2) b2.focus(); return; }
      if(e.target.closest("[data-iv-send]")){ sendInvite(); return; }
    });
  })();
  document.addEventListener("click", function(e){ if(!e.target.closest) return; var t;
    if((t=e.target.closest("[data-kri-upd]"))) openKri(t.getAttribute("data-kri-upd"), t);
    else if((t=e.target.closest("[data-kri-cf]"))) openConfirm(t.getAttribute("data-kri-cf"), t);
    else if((t=e.target.closest("[data-audit]"))) openAudit(t.getAttribute("data-audit"), t);
    else if((t=e.target.closest("[data-invite]"))) openInvite(t);
  });

  /* ---------------- EXCEL: แม่แบบ ปัจจัย > สาเหตุ > แนวทางจัดการ (one row = one action) ---------------- */
  var AX_HEAD = ["ปัจจัย","สาเหตุ","แนวทางจัดการ","ผู้รับผิดชอบ","กำหนดเสร็จ","สถานะ","ความคืบหน้า %","บันทึกความคืบหน้าเดือนนี้"];
  var AX_ST = {todo:"ยังไม่เริ่ม", doing:"กำลังทำ", done:"เสร็จ"}, AX_FIRST = 6;
  function axTemplate(){
    var r=RISKS.filter(function(x){ return x.id===actEdit.rid; })[0]; if(!r) return;
    loadLib("xlsx").then(function(){
      var wb=new window.ExcelJS.Workbook(); wb.creator="PRECISE Risk Management Cockpit";
      var NAVY="FF1E2761", LINE={style:"thin", color:{argb:"FFD5DAE3"}}, F={name:"Tahoma", size:10};
      var ws=wb.addWorksheet("แนวทางจัดการ", {views:[{state:"frozen", xSplit:2, ySplit:AX_FIRST-1}], pageSetup:{orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, paperSize:9}});
      ws.columns=[42,48,52,26,14,13,12,40].map(function(w){ return {width:w}; });
      ws.getCell("A1").value="ปัจจัย สาเหตุ และแนวทางจัดการ"; ws.getCell("A1").font={name:"Tahoma", size:14, bold:true, color:{argb:NAVY}};
      ws.getCell("A2").value="รหัสความเสี่ยง"; ws.getCell("B2").value=r.id; ws.getCell("B2").font={name:"Consolas", size:11, bold:true, color:{argb:NAVY}};
      ws.getCell("A3").value="ความเสี่ยง"; ws.getCell("B3").value=r.title; ws.mergeCells("B3:H3"); ws.getCell("B3").alignment={wrapText:true, vertical:"top"}; ws.getRow(3).height=32;
      [2,3].forEach(function(i){ ws.getCell("A"+i).font={name:"Tahoma", size:10, bold:true, color:{argb:"FF5B6472"}}; ws.getCell("A"+i).alignment={vertical:"top"}; });
      var hr=ws.getRow(AX_FIRST-1); hr.values=AX_HEAD; hr.height=22;
      hr.eachCell(function(c){ c.font={name:"Tahoma", size:10, bold:true, color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern", pattern:"solid", fgColor:{argb:NAVY}}; c.alignment={vertical:"middle"}; c.border={top:LINE,left:LINE,bottom:LINE,right:LINE}; });
      var row=AX_FIRST;
      actEdit.f.forEach(function(f){
        function put(cause, it){
          var x=ws.getRow(row++), d=it && it.due ? new Date(it.due+"T00:00:00Z") : null;
          x.values=[f.name, cause, it?it.text:"", it?it.owner:"", d, it?AX_ST[it.status]:"", it && it.status==="doing" && it.pct!=="" ? +it.pct : (it && it.status==="done" ? 100 : null), ""];
        }
        f.causes.forEach(function(c){ if(c.items.length) c.items.forEach(function(it){ put(c.text, it); }); else put(c.text, null); });
        f.orphans.forEach(function(it){ put("", it); });
      });
      var last=Math.max(row-1, AX_FIRST)+200; // room to add rows
      for(var i=AX_FIRST; i<=last; i++){ var x=ws.getRow(i);
        for(var c=1; c<=8; c++){ var cell=x.getCell(c); cell.font=F; cell.alignment={vertical:"top", wrapText:c!==5&&c!==6&&c!==7}; cell.border={top:LINE,left:LINE,bottom:LINE,right:LINE}; }
        x.getCell(2).fill={type:"pattern", pattern:"solid", fgColor:{argb:"FFEEEBFD"}};
        x.getCell(5).numFmt="dd/mm/yyyy";
        x.getCell(6).dataValidation={type:"list", allowBlank:true, formulae:['"ยังไม่เริ่ม,กำลังทำ,เสร็จ"'], showErrorMessage:true, errorTitle:"สถานะ", error:"เลือก ยังไม่เริ่ม / กำลังทำ / เสร็จ"};
        x.getCell(7).dataValidation={type:"whole", operator:"between", allowBlank:true, formulae:[0,100], showErrorMessage:true, error:"ใส่ 0–100"};
        x.getCell(5).dataValidation={type:"date", operator:"greaterThan", allowBlank:true, formulae:[new Date("2020-01-01")], showErrorMessage:true, error:"ใส่วันที่ เช่น 31/12/2026"};
      }
      var wh=wb.addWorksheet("วิธีกรอก"); wh.columns=[{width:4},{width:90}];
      ["หนึ่งแถว = แนวทางจัดการ 1 ข้อ",
       "ปัจจัยและสาเหตุ พิมพ์ซ้ำทุกแถว หรือเว้นว่างไว้ = เหมือนแถวบน",
       "สาเหตุที่ยังไม่มีแนวทาง: ใส่ปัจจัยและสาเหตุ แล้วเว้นช่องแนวทางจัดการ",
       "สถานะ เลือกจากรายการ · ความคืบหน้า % ใส่เมื่อ กำลังทำ",
       "ห้ามแก้รหัสความเสี่ยงในช่อง B2 · นำเข้าได้ที่ปุ่ม “นำเข้าจาก Excel” ในหน้าแก้ไข"].forEach(function(t, i){
        var x=wh.getRow(i+1); x.values=[i+1, t]; x.font={name:"Tahoma", size:11}; });
      return wb.xlsx.writeBuffer().then(function(buf){
        return saveFile("PRECISE_Treatment_"+r.id+".xlsx", new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      });
    }).catch(function(){ toast("สร้างไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง"); });
  }
  function axText(v){ if(v==null) return ""; if(typeof v==="object"){ if(v.richText) return v.richText.map(function(t){ return t.text; }).join(""); if(v.text!=null) return String(v.text); if(v.result!=null) return String(v.result); } return String(v).trim(); }
  function axDate(v){
    function iso(y,m,d){ if(y>2400) y-=543; var dt=new Date(Date.UTC(y,m-1,d)); return (dt.getUTCFullYear()===y && dt.getUTCMonth()===m-1) ? dt.toISOString().slice(0,10) : null; }
    if(v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0,10);
    if(typeof v==="number") return new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10);
    var s=axText(v), m;
    if((m=/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s))) return iso(+m[3],+m[2],+m[1]);
    if((m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return iso(+m[1],+m[2],+m[3]);
    return null;
  }
  function axImport(file){
    var name=file.name;
    loadLib("xlsx").then(function(){ return file.arrayBuffer(); }).then(function(buf){
      var wb=new window.ExcelJS.Workbook(); return wb.xlsx.load(buf).then(function(){ return wb; });
    }).then(function(wb){
      var ws=wb.getWorksheet("แนวทางจัดการ") || wb.worksheets[0], errs=[];
      var rid=axText(ws.getCell("B2").value);
      if(rid!==actEdit.rid){ actEdit.msg={err:true, file:name, lines:["ไฟล์นี้เป็นของ "+(rid||"ความเสี่ยงอื่น")+" ไม่ใช่ "+actEdit.rid]}; keepScroll(renderActEditor); return; }
      var ST={"ยังไม่เริ่ม":"todo","กำลังทำ":"doing","เสร็จ":"done"}, old={};
      actEdit.f.forEach(function(f){ f.causes.forEach(function(c){ c.items.forEach(function(it){ old[f.name+"|"+it.text]=it; }); }); f.orphans.forEach(function(it){ old[f.name+"|"+it.text]=it; }); });
      var out=[], fac=null, cau=null, nA=0;
      ws.eachRow(function(x, n){ if(n<AX_FIRST) return;
        var v=[1,2,3,4,5,6,7,8].map(function(i){ return x.getCell(i).value; }), t=v.map(axText);
        if(!t.some(Boolean)) return;
        if(t[0] && (!fac || fac.name!==t[0])){ fac=out.filter(function(o){ return o.name===t[0]; })[0]; if(!fac){ fac={name:t[0], causes:[], orphans:[]}; out.push(fac); } cau=null; }
        if(!fac){ errs.push("แถว "+n+": ไม่มีปัจจัย"); return; }
        if(t[1] && (!cau || cau.text!==t[1])){ cau=fac.causes.filter(function(c){ return c.text===t[1]; })[0]; if(!cau){ cau={text:t[1], items:[]}; fac.causes.push(cau); } }
        if(!cau){ errs.push("แถว "+n+": ไม่มีสาเหตุ"); return; }
        if(!t[2]) return; // cause without action yet
        var st=ST[t[5]||"ยังไม่เริ่ม"], due=axDate(v[4]), pct=t[6]==="" ? "" : Math.round(+t[6]);
        if(!st){ errs.push("แถว "+n+": สถานะ “"+t[5]+"” ไม่ถูกต้อง"); return; }
        if(!due){ errs.push("แถว "+n+": กำหนดเสร็จ "+(t[4]?"“"+t[4]+"” อ่านไม่ได้":"ว่าง")); return; }
        if(pct!=="" && (isNaN(pct) || pct<0 || pct>100)){ errs.push("แถว "+n+": ความคืบหน้า % ต้องเป็น 0–100"); return; }
        var prev=old[fac.name+"|"+t[2]];
        cau.items.push({text:t[2], owner:t[3], due:due, status:st, pct:st==="doing"?pct:"", log:prev?prev.log.slice():[], note:t[7]}); nA++;
      });
      if(!out.length) errs.push("ไม่พบข้อมูลตั้งแต่แถว "+AX_FIRST);
      if(errs.length){ actEdit.msg={err:true, file:name, lines:errs}; keepScroll(renderActEditor); return; }
      actEdit.f=out; actEdit.sel=null; actEdit.open=null;
      var nC=out.reduce(function(s,f){ return s+f.causes.length; },0);
      actEdit.msg={err:false, file:name, lines:[out.length+" ปัจจัย · "+nC+" สาเหตุ · "+nA+" แนวทางจัดการ — ตรวจแล้วกดบันทึก"]};
      renderActEditor(); var b=document.querySelector("#aeRoot .ae-body"); if(b) b.scrollTop=0;
    }).catch(function(){ actEdit.msg={err:true, file:name, lines:["เปิดไฟล์ไม่ได้ ใช้ไฟล์ .xlsx จากแม่แบบ"]}; keepScroll(renderActEditor); });
  }

  /* ---------------- EXCEL: แม่แบบค่า KRI รายเดือน (one row = one KRI) ---------------- */
  var KX_FIRST = 7;
  function kxTemplate(){
    var r=riskById(dlg.rid); if(!r) return; var rows=dlg.rows;
    loadLib("xlsx").then(function(){
      var wb=new window.ExcelJS.Workbook(); wb.creator="PRECISE Risk Management Cockpit";
      var NAVY="FF1E2761", LINE={style:"thin", color:{argb:"FFD5DAE3"}}, F={name:"Tahoma", size:10}, GREY="FFF1F3F6", FILL="FFFFF8DB";
      var ws=wb.addWorksheet("KRI", {views:[{state:"frozen", xSplit:3, ySplit:KX_FIRST-1}], pageSetup:{orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, paperSize:9}});
      ws.columns=[5,9,40,46,17,17,17,16,10,26,48].map(function(w){ return {width:w}; });
      ws.getCell("A1").value="ค่า KRI รายเดือน"; ws.getCell("A1").font={name:"Tahoma", size:14, bold:true, color:{argb:NAVY}};
      [["A2","รหัสความเสี่ยง","C2",r.id],["A3","ความเสี่ยง","C3",r.title],["A4","งวด","C4",PERIOD]].forEach(function(x){
        ws.getCell(x[0]).value=x[1]; ws.getCell(x[0]).font={name:"Tahoma", size:10, bold:true, color:{argb:"FF5B6472"}}; ws.getCell(x[0]).alignment={vertical:"top"};
        ws.getCell(x[2]).value=x[3]; ws.getCell(x[2]).font={name:x[0]==="A2"?"Consolas":"Tahoma", size:x[0]==="A2"?11:10, bold:x[0]!=="A3", color:{argb:NAVY}}; });
      ws.mergeCells("C3:K3"); ws.getCell("C3").alignment={wrapText:true, vertical:"top"}; ws.getRow(3).height=30;
      var head=["#","ปัจจัย","KRI","วิธีวัด","Appetite","Tolerance","เดือนก่อน · "+PREV_PERIOD,"เดือนนี้ · "+PERIOD,"หน่วย","ตัวเลขที่ใช้คำนวณ","สาเหตุที่เกิน Tolerance และสิ่งที่จะทำ"];
      var hr=ws.getRow(KX_FIRST-1); hr.values=head; hr.height=30;
      hr.eachCell(function(c, i){ var fill=i===8||i===10||i===11; c.font={name:"Tahoma", size:10, bold:true, color:{argb:fill?"FF1E2761":"FFFFFFFF"}}; c.fill={type:"pattern", pattern:"solid", fgColor:{argb:fill?"FFFFE58A":NAVY}}; c.alignment={vertical:"middle", wrapText:true}; c.border={top:LINE,left:LINE,bottom:LINE,right:LINE}; });
      r.kris.forEach(function(k, i){ var row=rows[i], x=ws.getRow(KX_FIRST+i);
        x.values=[i+1, k.f?"ปัจจัย "+k.f:"รวม", k.name, k.calc||"", k.appetite||"", k.tolerance||"", row.prev===null?"":hFmt(row.prev,row.md.unit), row.v===""?null:+row.v, row.md.unit||"", row.detail, row.note];
        for(var c=1;c<=11;c++){ var cell=x.getCell(c), fill=c===8||c===10||c===11; cell.font=F; cell.border={top:LINE,left:LINE,bottom:LINE,right:LINE};
          cell.alignment={vertical:"top", wrapText:c===3||c===4||c===10||c===11, horizontal:c===1||c===2||c===9?"center":(c>=5&&c<=8?"right":"left")};
          cell.fill={type:"pattern", pattern:"solid", fgColor:{argb:fill?FILL:GREY}}; }
        x.getCell(8).font={name:"Tahoma", size:11, bold:true}; x.getCell(8).numFmt="#,##0.###";
        x.getCell(8).dataValidation={type:"decimal", operator:"between", allowBlank:true, formulae:[-1e12, 1e12], showErrorMessage:true, errorTitle:"ค่า KRI", error:"ใส่ตัวเลขเท่านั้น (ไม่ต้องใส่หน่วย)"};
      });
      var wh=wb.addWorksheet("วิธีกรอก"); wh.columns=[{width:4},{width:90}];
      ["กรอกเฉพาะช่องสีเหลือง: ค่าเดือนนี้ · ตัวเลขที่ใช้คำนวณ · สาเหตุ (ถ้าเกิน Tolerance)",
       "ค่าเดือนนี้ใส่ตัวเลขอย่างเดียว ไม่ต้องใส่หน่วยหรือ %",
       "ห้ามเพิ่ม ลบ หรือสลับแถว KRI และห้ามแก้รหัสความเสี่ยงในช่อง C2",
       "นำเข้าได้ที่ปุ่ม “นำเข้า” ในหน้าอัปเดตค่า KRI แล้วตรวจก่อนกดส่ง"].forEach(function(t, i){ var x=wh.getRow(i+1); x.values=[i+1, t]; x.font={name:"Tahoma", size:11}; });
      return wb.xlsx.writeBuffer().then(function(buf){
        return saveFile("PRECISE_KRI_"+r.id+"_"+PERIOD.replace(/\s/g,"").replace(/\./g,"")+".xlsx", new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      });
    }).catch(function(){ toast("สร้างไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง"); });
  }
  function kxImport(file){
    var name=file.name, r=riskById(dlg.rid);
    function fail(lines){ dlg.msg={err:true, file:name, lines:lines}; keepScroll(renderDlg); }
    loadLib("xlsx").then(function(){ return file.arrayBuffer(); }).then(function(buf){
      var wb=new window.ExcelJS.Workbook(); return wb.xlsx.load(buf).then(function(){ return wb; });
    }).then(function(wb){
      var ws=wb.getWorksheet("KRI") || wb.worksheets[0], errs=[], got=[];
      var rid=axText(ws.getCell("C2").value);
      if(rid!==r.id) return fail(["ไฟล์นี้เป็นของ "+(rid||"ความเสี่ยงอื่น")+" ไม่ใช่ "+r.id]);
      var per=axText(ws.getCell("C4").value);
      if(per && per!==PERIOD) errs.push("ไฟล์เป็นงวด "+per+" แต่หน้านี้เป็นงวด "+PERIOD);
      r.kris.forEach(function(k, i){ var n=KX_FIRST+i, x=ws.getRow(n), nm=axText(x.getCell(3).value);
        if(nm!==k.name){ errs.push("แถว "+n+": KRI ไม่ตรง (“"+(nm||"ว่าง")+"”) อย่าเพิ่ม ลบ หรือสลับแถว"); return; }
        var raw=x.getCell(8).value, t=axText(raw).replace(/[,%\s]/g,""), v = raw==null || t==="" ? "" : (typeof raw==="number" ? raw : +t);
        if(v!=="" && isNaN(v)){ errs.push("แถว "+n+": ค่าเดือนนี้ “"+axText(raw)+"” ไม่ใช่ตัวเลข"); return; }
        got.push({i:i, v:v===""?"":String(Math.round(v*1e6)/1e6), detail:axText(x.getCell(10).value), note:axText(x.getCell(11).value)});
      });
      if(errs.length) return fail(errs);
      got.forEach(function(g){ var row=dlg.rows[g.i]; row.v=g.v; row.detail=g.detail; row.note=g.note; });
      var filled=got.filter(function(g){ return g.v!==""; }).length, crit=dlg.rows.filter(function(row){ return kriRowSt(row)==="crit"; }).length;
      dlg.err=""; dlg.msg={err:false, file:name, lines:["กรอกค่าแล้ว "+filled+" จาก "+r.kris.length+" KRI"+(crit?" · เกิน Tolerance "+crit+" ตัว":"")+" — ตรวจแล้วกดส่ง"]};
      renderDlg(); var b=document.querySelector("#aeRoot .ae-body"); if(b) b.scrollTop=0;
    }).catch(function(){ fail(["เปิดไฟล์ไม่ได้ ใช้ไฟล์ .xlsx จากแม่แบบ"]); });
  }
  function dlgMsg(m){ return m ? '<div class="dl-alert '+(m.err?'crit':'good')+'" role="'+(m.err?'alert':'status')+'">'+icon(m.err?"flag":"check")+'<div><b>'+(m.err?'นำเข้าไม่ได้ · ':'นำเข้าแล้ว · ')+esc(m.file)+'</b>'+m.lines.slice(0,8).map(function(l){ return '<div>'+esc(l)+'</div>'; }).join('')+(m.lines.length>8?'<div>และอีก '+(m.lines.length-8)+' รายการ</div>':'')+'</div></div>' : ''; }

  /* ---------------- OVERVIEW: what needs a decision this month ---------------- */
  function prevAsOf(){ var y=+ASOF.slice(0,4), m=+ASOF.slice(5,7)-1; if(m<1){ m=12; y--; } return y+"-"+("0"+m).slice(-2)+ASOF.slice(7); }
  var ST_RANK={pending:-1, good:0, watch:1, crit:2};
  function ovChanges(list){
    var worse=[], better=[], late=[], p0=prevAsOf();
    list.forEach(function(r){
      r.kris.forEach(function(k, ki){ var md=kriMd(r,k); if(!md.ok || md.app===null) return; var n=md.vals.length, a=hStatus(md, md.vals[n-2]), b=k.status;
        if(ST_RANK[b]>ST_RANK[a]) worse.push({r:r, k:k, ki:ki, a:a, b:b, pv:hFmt(md.vals[n-2],md.unit)}); else if(ST_RANK[b]<ST_RANK[a] && ST_RANK[b]>=0) better.push({r:r, k:k, ki:ki, a:a, b:b, pv:hFmt(md.vals[n-2],md.unit)}); });
      r.factors.forEach(function(f){ (f.acts||[]).forEach(function(a, ai){ if(a.status!=="done" && a.due<ASOF && a.due>=p0) late.push({r:r, t:f.responses[ai], a:a}); }); });
    });
    return {worse:worse, better:better, late:late};
  }
  var ST_SHORT={crit:"เกิน Tolerance", watch:"เฝ้าระวัง", good:"ปกติ", pending:"รอข้อมูล"};
  function ovDecide(list){
    var crit=[]; list.forEach(function(r){ r.kris.forEach(function(k, ki){ if(k.status==="crit") crit.push({r:r, k:k, ki:ki}); }); });
    crit.sort(function(x,y){ return riskScore(y.r)-riskScore(x.r) || (x.r.id<y.r.id?-1:1); });
    var ch=ovChanges(list);
    function kriRow(o, extra){ return '<button type="button" class="ov-row" data-risk="'+o.r.id+'" data-hsel="kri:'+o.ki+'"><span class="ov-rid mono">'+o.r.id+'</span><span class="ov-t">'+esc(o.k.name)+'</span>'+(extra||'<span class="ov-v mono">'+esc(o.k.current)+'</span>')+'</button>'; }
    var shown=crit.slice(0,9);
    var c1='<div class="card ov-card"><div class="card-head"><h3>KRI เกิน Tolerance ('+crit.length+')</h3></div>'+
      (shown.length ? shown.map(function(o){ return kriRow(o); }).join('') : '<div class="ov-none">ไม่มี KRI เกิน Tolerance</div>')+
      (crit.length>shown.length ? '<button type="button" class="ov-more" data-goto-crit="1">ดูทั้งหมด '+crit.length+' ตัวใน KRI Monitoring</button>' : '')+'</div>';
    function grp(title, cls, items, fn, max){ max=max||3; return items.length ? '<div class="ov-g"><div class="ov-gh '+cls+'">'+title+' <span class="rf-n">'+items.length+'</span></div>'+items.slice(0,max).map(fn).join('')+(items.length>max?'<div class="ov-gm">และอีก '+(items.length-max)+' รายการ</div>':'')+'</div>' : ''; }
    var rc=revCompare(ROUNDS[ROUNDS.length-2]||"", ROUNDS[ROUNDS.length-1]||"", list), lv=rc.nw.map(function(o){ return {r:o.r, txt:'เพิ่มใหม่ '+o.s.L+'×'+o.s.I}; }).concat(rc.up.map(function(o){ return {r:o.r, txt:o.a.L+'×'+o.a.I+' → '+o.b.L+'×'+o.b.I}; }), rc.dn.map(function(o){ return {r:o.r, txt:o.a.L+'×'+o.a.I+' → '+o.b.L+'×'+o.b.I}; }));
    var body = grp('ความเสี่ยงเพิ่มใหม่ / ระดับเปลี่ยน', '', lv, function(o){ return '<button type="button" class="ov-row" data-risk="'+o.r.id+'"><span class="ov-rid mono">'+o.r.id+'</span><span class="ov-t">'+esc(o.r.title)+'</span><span class="ov-v mono">'+esc(o.txt)+'</span></button>'; })+
      grp('KRI แย่ลง', 'up', rc.kw, function(o){ return kriRow(o, '<span class="ov-v mono">'+esc(hFmt(o.a.v,o.a.u))+' → '+esc(hFmt(o.b.v,o.b.u))+'</span>'); })+
      grp('KRI ดีขึ้น', 'dn', rc.kb, function(o){ return kriRow(o, '<span class="ov-v mono">'+esc(hFmt(o.a.v,o.a.u))+' → '+esc(hFmt(o.b.v,o.b.u))+'</span>'); }, 2)+
      grp('แนวทางจัดการเพิ่งเลยกำหนด', 'up', ch.late, function(o){ return '<button type="button" class="ov-row" data-risk="'+o.r.id+'"><span class="ov-rid mono">'+o.r.id+'</span><span class="ov-t">'+esc(o.t)+'</span><span class="ov-v">กำหนด '+thDate(o.a.due)+'</span></button>'; });
    var c2='<div class="card ov-card"><div class="card-head"><h3>เปลี่ยนจากเดือนก่อน</h3><span class="act-asof">'+PREV_PERIOD+' → '+PERIOD+'</span></div>'+(body||'<div class="ov-none">ไม่มีการเปลี่ยนสถานะ</div>')+
      '<button type="button" class="ov-more" data-rv-goto="chg">ดูการเปลี่ยนแปลงรายไตรมาสใน Quarterly Review</button></div>';
    return '<div class="grid ov-grid">'+c1+c2+'</div>';
  }
  function ovBrief(list){
    var nCrit=0, nLate=0; list.forEach(function(r){ r.kris.forEach(function(k){ if(k.status==="crit") nCrit++; }); r.factors.forEach(function(f){ (f.acts||[]).forEach(function(a){ if(actState(a)==="late") nLate++; }); }); });
    var kw=revCompare(ROUNDS[ROUNDS.length-2]||"", ROUNDS[ROUNDS.length-1]||"", list).kw.length, nV=list.filter(function(r){ return r.level==="สูงมาก"; }).length;
    return '<div class="ov-brief">'+icon("flag")+'<span><b>'+PERIOD+'</b> · ความเสี่ยงระดับสูงมาก <b>'+nV+'</b> · KRI เกิน Tolerance <b>'+nCrit+'</b>'+
      (kw?' <span class="ov-up">(แย่ลงจากเดือนก่อน '+kw+')</span>':'')+' · แนวทางจัดการล่าช้า <b>'+nLate+'</b></span></div>';
  }

  /* ---------------- KRI MONITORING: KRI × month ---------------- */
  function kriMonthRows(list){
    return list.map(function(r){ return r.kris.map(function(k, ki){
      if(!inSel(kriSt, k.status)) return '';
      var md=kriMd(r,k), n=md.vals.length, cells='';
      for(var i=n-6;i<n;i++){ var v=md.ok?md.vals[i]:null, st = v===null || md.app===null ? "pending" : hStatus(md, v);
        cells+='<td class="km-c '+st+'" title="'+escAttr(HIST_MONTHS[i].label+' · '+(v===null?'—':hFmt(v,md.unit))+' · '+ST_SHORT[st])+'">'+(v===null?'—':(Math.abs(v)>=1000?v.toLocaleString("en-US"):v))+'</td>'; }
      return '<tr class="rs-row" data-risk="'+r.id+'" data-hsel="kri:'+ki+'" title="คลิกเพื่อดูกราฟประวัติ KRI"><td class="mono" style="color:var(--brand-700);white-space:nowrap;">'+r.id+'</td>'+
        '<td class="km-k">'+esc(k.name)+(md.unit?' <span class="km-u">('+esc(md.unit)+')</span>':'')+'</td>'+cells+'<td class="mono km-thr">'+esc(k.appetite||"—")+' · '+esc(k.tolerance||"—")+'</td></tr>';
    }).join(''); }).join('');
  }

  /* ---------------- REVISION LOG ---------------- */
  function renderRevision(){
    var list=filteredRisks(), all=[];
    list.forEach(function(r){ auditEntries(r).forEach(function(e){ e.rid=r.id; all.push(e); }); });
    all.sort(function(a,b){ return (b.d+b.tm).localeCompare(a.d+a.tm) || (a.rid<b.rid?-1:1); });
    var cnt={all:all.length}; all.forEach(function(e){ cnt[e.type]=(cnt[e.type]||0)+1; });
    var shown=all.filter(function(e){ return audF==="all" || e.type===audF; });
    var toolbar='<div class="rf tb">'+companyRow(function(id){ return scopeRisks().filter(function(r){ return r.sub===id; }).length; })+
      tbRow('ประเภท', AUD_T.map(function(t){ return rkChip('aud', t[0], t[1], audF===t[0], cnt[t[0]]||0); }).join(''))+
      tbSum(Math.min(shown.length, audLimit), shown.length, 'รายการ', false)+'</div>';
    var body = shown.length ? '<ol class="au-list">'+shown.slice(0, audLimit).map(function(e){ return auditItemHtml(e, true); }).join('')+'</ol>'+
      (shown.length>audLimit ? '<button type="button" class="ov-more" data-aud-more="1">แสดงเพิ่มอีก '+Math.min(60, shown.length-audLimit)+' รายการ</button>' : '') : emptyState('ไม่มีรายการตามตัวกรองนี้');
    return '<div class="page-head"><div><h2>Audit Trail</h2><div class="sub">ใครแก้อะไร เมื่อไร ค่าเดิมและค่าใหม่ · บันทึกอัตโนมัติ แก้ไขหรือลบไม่ได้ · สิ่งที่เปลี่ยนรายไตรมาสดูใน Quarterly Review</div></div></div>'+
      toolbar+'<div class="card rv-card">'+body+'</div>'+renderRiskModal();
  }

  /* ---------------- REVISIONS: round-by-round snapshots ---------------- */
  var REV = (PRC.REVISIONS||[]).slice().sort(function(a,b){ return b.p.localeCompare(a.p); }), ROUNDS = PRC.REV_ROUNDS||[];
  var revA = ROUNDS[ROUNDS.length-2]||"", revB = ROUNDS[ROUNDS.length-1]||"", revView = "compare", rmTab = "detail";
  function roundLabel(p){ return TH_MON[+p.slice(5,7)-1]+" "+String(+p.slice(0,4)+543).slice(2); }
  function roundIdx(p){ var c=ASOF.slice(0,7), d=(+c.slice(0,4)-+p.slice(0,4))*12+(+c.slice(5,7)-+p.slice(5,7)); return HIST_MONTHS.length-1-d; }
  var LV_NAME={"l-crit":"สูงมาก","l-high":"สูง","l-mid":"ปานกลาง","l-low":"ต่ำ"};
  function riskAt(r, p){ var s={exists:true, L:r.L, I:r.I, owner:r.owner, nF:r.factors.length};
    REV.forEach(function(c){ if(c.rid!==r.id || c.p<=p) return;
      if(c.t==="new") s.exists=false; else if(c.t==="LI"){ s.L=c.a[0]; s.I=c.a[1]; } else if(c.t==="owner") s.owner=c.a; else if(c.t==="factor_add") s.nF--; });
    s.level=LV_NAME[levelForLICorrect(s.L, s.I)]; return s; }
  function kriStAt(r, k, p){ var md=kriMd(r,k), i=roundIdx(p); if(!md.ok || md.app===null || i<0) return {st:"pending", v:null, u:md.unit}; return {st:hStatus(md, md.vals[i]), v:md.vals[i], u:md.unit}; }
  function revCompare(A, B, list){
    var g={nw:[], cl:[], up:[], dn:[], thr:[], oth:[], kw:[], kb:[]}, ids=list.map(function(r){ return r.id; });
    list.forEach(function(r){ var sA=riskAt(r,A), sB=riskAt(r,B);
      if(!sB.exists) return;
      if(!sA.exists){ g.nw.push({r:r, s:sB, c:REV.filter(function(c){ return c.rid===r.id && c.t==="new"; })[0]}); return; }
      var d=sB.L*sB.I - sA.L*sA.I; if(d){ (d>0?g.up:g.dn).push({r:r, a:sA, b:sB, c:REV.filter(function(c){ return c.rid===r.id && c.t==="LI" && c.p>A && c.p<=B; })[0]}); }
      r.kris.forEach(function(k, ki){ var a=kriStAt(r,k,A), b=kriStAt(r,k,B); if(a.st==="pending"||b.st==="pending") return;
        if(ST_RANK[b.st]>ST_RANK[a.st]) g.kw.push({r:r, k:k, ki:ki, a:a, b:b}); else if(ST_RANK[b.st]<ST_RANK[a.st]) g.kb.push({r:r, k:k, ki:ki, a:a, b:b}); });
    });
    REV.forEach(function(c){ if(!(c.p>A && c.p<=B)) return;
      if(c.t==="close"){ if(inSel(activeFilter, c.sub) && !(currentUser && currentUser.risks)) g.cl.push(c); return; }
      if(ids.indexOf(c.rid)===-1) return;
      if(c.t==="app" || c.t==="tol" || c.t==="base" || c.t==="target") g.thr.push(c); else if(c.t==="owner" || c.t==="factor_add" || c.t==="kri_del") g.oth.push(c); });
    return g;
  }
  function revTxt(c){ return c.t==="base" ? 'Baseline '+c.a.join('×')+' → '+c.b.join('×') : c.t==="target" ? 'Target '+c.a.join('×')+' → '+c.b.join('×') : c.t==="app" ? 'Appetite '+c.a+' → '+c.b : c.t==="tol" ? 'Tolerance '+c.a+' → '+c.b : c.t==="owner" ? 'Risk Owner: '+c.a+' → '+c.b : c.t==="factor_add" ? 'เพิ่มปัจจัยเสี่ยง: '+c.k : c.t==="kri_del" ? 'ตัด KRI: '+c.k : ''; }
  function rvRow(rid, t, chg, note, hsel, noClick){
    var inner='<span class="ov-rid mono">'+rid+'</span><span class="ov-t">'+esc(t)+(note?'<span class="rv-note">'+esc(note)+'</span>':'')+'</span><span class="rv-chg">'+chg+'</span>';
    return noClick ? '<div class="ov-row rv-row static">'+inner+'</div>' : '<button type="button" class="ov-row rv-row" data-risk="'+rid+'"'+(hsel?' data-hsel="'+hsel+'"':'')+'>'+inner+'</button>';
  }
  function liTxt(s){ return levelPill(s.level)+' <span class="mono">'+s.L+'×'+s.I+'</span>'; }
  function renderRevCompare(list, A, B){ var fixed=!!A; A=A||revA; B=B||revB;
    var g=revCompare(A, B, list);
    var sel=function(id, val){ return '<select class="rf-sel" id="'+id+'" aria-label="'+(id==="revA"?'รอบก่อน':'รอบนี้')+'">'+ROUNDS.map(function(p){ return '<option value="'+p+'"'+(p===val?' selected':'')+'>'+roundLabel(p)+'</option>'; }).join('')+'</select>'; };
    var T=[["nw","เพิ่มใหม่","",g.nw.length],["cl","ปิด","",g.cl.length],["up","ระดับสูงขึ้น","bad",g.up.length],["dn","ระดับลดลง","good",g.dn.length],["thr","ปรับเกณฑ์","",g.thr.length],["kw","KRI แย่ลง","bad",g.kw.length],["kb","KRI ดีขึ้น","good",g.kb.length]];
    var tiles='<div class="rv-tiles">'+T.map(function(t){ return '<a class="rv-tile '+t[2]+(t[3]?'':' zero')+'" href="#rv-'+t[0]+'"><b class="mono">'+t[3]+'</b><span>'+t[1]+'</span></a>'; }).join('')+'</div>';
    function sec(key, title, rows){ return rows.length ? '<section class="rv-sec" id="rv-'+key+'"><h4>'+title+' <span class="rf-n">'+rows.length+'</span></h4>'+rows.join('')+'</section>' : ''; }
    var body=
      sec('nw','ความเสี่ยงเพิ่มใหม่', g.nw.map(function(o){ return rvRow(o.r.id, o.r.title, liTxt(o.s), o.c&&o.c.note); }))+
      sec('cl','ความเสี่ยงที่ปิด', g.cl.map(function(c){ return rvRow(c.rid, c.title, '<span class="pill pending">ปิดแล้ว</span>', c.note, null, true); }))+
      sec('up','ระดับความเสี่ยงสูงขึ้น', g.up.map(function(o){ return rvRow(o.r.id, o.r.title, liTxt(o.a)+' → '+liTxt(o.b), o.c&&o.c.note); }))+
      sec('dn','ระดับความเสี่ยงลดลง', g.dn.map(function(o){ return rvRow(o.r.id, o.r.title, liTxt(o.a)+' → '+liTxt(o.b), o.c&&o.c.note); }))+
      sec('thr','ปรับเกณฑ์ (Appetite / Tolerance / Baseline / Target)', g.thr.map(function(c){ var rr=riskById(c.rid); return rvRow(c.rid, c.k||(rr?rr.title:''), '<span class="mono">'+esc(revTxt(c))+'</span>', c.note); }))+
      sec('oth','เปลี่ยนแปลงอื่น', g.oth.map(function(c){ var r=riskById(c.rid); return rvRow(c.rid, r?r.title:'', esc(revTxt(c)), c.note); }))+
      sec('kw','KRI แย่ลง', g.kw.map(function(o){ return rvRow(o.r.id, o.k.name, '<span class="mono">'+hFmt(o.a.v,o.a.u)+' → '+hFmt(o.b.v,o.b.u)+'</span> '+statusPill(o.b.st), null, 'kri:'+o.ki); }))+
      sec('kb','KRI ดีขึ้น', g.kb.map(function(o){ return rvRow(o.r.id, o.k.name, '<span class="mono">'+hFmt(o.a.v,o.a.u)+' → '+hFmt(o.b.v,o.b.u)+'</span> '+statusPill(o.b.st), null, 'kri:'+o.ki); }));
    var bad = A>=B ? '<div class="ov-none">เลือกรอบก่อนให้เก่ากว่ารอบนี้</div>' : '';
    if(fixed) return '<div class="rv-fixed"><div class="rv-pick"><span>เทียบสิ้น '+roundLabel(A)+' → สิ้น '+roundLabel(B)+'</span></div>'+tiles+(body||'<div class="ov-none">ไม่มีการเปลี่ยนแปลงในไตรมาสนี้</div>')+'</div>';
    return '<div class="card rv-card"><div class="rv-pick"><span>เทียบ</span>'+sel("revA", revA)+'<span>→</span>'+sel("revB", revB)+'</div>'+
      (bad || tiles+(body||'<div class="ov-none">ไม่มีการเปลี่ยนแปลงระหว่าง 2 รอบนี้</div>'))+'</div>';
  }
  /* risk modal · ประวัติ */
  function riskHistoryHtml(r){
    var rs=ROUNDS.slice().reverse(), items='';
    for(var i=0;i<rs.length;i++){ var p=rs[i], s=riskAt(r,p); if(!s.exists) break;
      var prev=rs[i+1], ev=[], nk=0, nc=0;
      r.kris.forEach(function(k){ var x=kriStAt(r,k,p); if(x.st!=="pending"){ nk++; if(x.st==="crit") nc++; } });
      REV.forEach(function(c){ if(c.rid!==r.id || c.p!==p) return;
        if(c.t==="new") ev.push('<li class="rh-new">เพิ่มเข้าทะเบียนความเสี่ยง'+(c.note?' — '+esc(c.note):'')+'</li>');
        else if(c.t==="LI"){ var a=LV_NAME[levelForLICorrect(c.a[0],c.a[1])]; ev.push('<li>ระดับความเสี่ยง <span class="mono">'+c.a[0]+'×'+c.a[1]+'</span> '+a+' → <span class="mono">'+c.b[0]+'×'+c.b[1]+'</span> '+LV_NAME[levelForLICorrect(c.b[0],c.b[1])]+(c.note?' — '+esc(c.note):'')+'</li>'); }
        else ev.push('<li>'+esc(revTxt(c)+(c.k&&(c.t==="app"||c.t==="tol")?' ('+c.k+')':''))+(c.note?' — '+esc(c.note):'')+'</li>'); });
      if(prev && riskAt(r,prev).exists) r.kris.forEach(function(k){ var a=kriStAt(r,k,prev), b=kriStAt(r,k,p);
        if(a.st!=="pending" && b.st!=="pending" && a.st!==b.st) ev.push('<li>KRI '+esc(k.name)+': <span class="mono">'+hFmt(a.v,a.u)+' → '+hFmt(b.v,b.u)+'</span> '+(ST_RANK[b.st]>ST_RANK[a.st]?'<b class="rh-bad">'+ST_SHORT[b.st]+'</b>':'<b class="rh-good">'+ST_SHORT[b.st]+'</b>')+'</li>'); });
      r.factors.forEach(function(f){ (f.acts||[]).forEach(function(a, ai){ var last=(a.log||[])[a.log?a.log.length-1:0];
        if(a.status==="done" && last && last.d.slice(0,7)===p) ev.push('<li>แนวทางจัดการเสร็จ: '+esc(f.responses[ai])+'</li>');
        if(a.status!=="done" && a.due.slice(0,7)===p && a.due<ASOF) ev.push('<li class="rh-late">แนวทางจัดการเลยกำหนด: '+esc(f.responses[ai])+'</li>'); }); });
      items+='<li class="rh-item"><div class="rh-when"><b>'+roundLabel(p)+'</b>'+(i===0?'<span>รอบล่าสุด</span>':'')+'</div><span class="au-dot" aria-hidden="true"></span>'+
        '<div class="rh-body"><div class="rh-top">'+levelPill(s.level)+'<span class="mono">L'+s.L+' × I'+s.I+'</span><span>KRI เกิน Tolerance '+nc+' จาก '+nk+'</span></div>'+
        (ev.length ? '<ul class="rh-ev">'+ev.join('')+'</ul>' : '<div class="rh-none">ไม่มีการเปลี่ยนแปลง</div>')+'</div></li>';
    }
    var audit = currentUser && can("ดู Audit Trail", r) ? '<button type="button" class="ra-btn sm ghost" data-audit="'+r.id+'">'+icon("history")+'บันทึกการแก้ไขทั้งหมด (Audit Trail)</button>' : '';
    return yeLineageHtml(r)+'<div class="rh"><div class="rh-head"><h4>ประวัติรายเดือน</h4>'+audit+'</div><ol class="rh-list">'+items+'</ol></div>';
  }

  /* ---------------- LEVEL PATH: Baseline → รายไตรมาส → Target ---------------- */
  var QUARTERS = PRC.QUARTERS || [], RL = PRC.RISK_LEVELS || {}, BASE_PENDING = PRC.BASE_PENDING || {};
  var QCUR = QUARTERS[QUARTERS.length-1] || null;
  (function(){ var n=PRC.KRI_NOTES||{}; RISKS.forEach(function(r){ r.kris.forEach(function(k){ if(!k.note && n[r.id+"|"+k.name]) k.note=n[r.id+"|"+k.name]; }); }); })();
  var LV_RANK = {"l-low":0, "l-mid":1, "l-high":2, "l-crit":3};
  function lvRank(L, I){ return LV_RANK[levelForLICorrect(L, I)]; }
  function lvPillLI(s){ return levelPill(LV_NAME[levelForLICorrect(s.L, s.I)])+' <span class="mono lp-li">'+s.L+'×'+s.I+'</span>'; }
  function monLabel(ym){ return TH_MON[+ym.slice(5,7)-1]+" "+String(+ym.slice(0,4)+543).slice(2); }
  function qById(id){ return QUARTERS.filter(function(q){ return q.id===id; })[0]; }
  function monthsBack(ym, n){ var y=+ym.slice(0,4), m=+ym.slice(5,7)-n; while(m<1){ m+=12; y--; } return y+"-"+("0"+m).slice(-2); }
  function qStart(q){ return monthsBack(q.end, 2); }
  /* Baseline / Target in force at round p (current value, with later RMC changes undone) */
  function lvAt(r, p, t){ var rl=RL[r.id]; if(!rl || !rl[t]) return null; var o=rl[t], s={L:o.L, I:o.I, mtg:o.mtg, d:o.d, by:o.by, chg:null};
    REV.forEach(function(c){ if(c.rid!==r.id || c.t!==t) return; if(c.p>p){ s.L=c.a[0]; s.I=c.a[1]; } else if(!s.chg) s.chg=c; }); return s; }
  function lvVerdict(cur, base, tgt){ if(!base) return null;
    var sc=cur.L*cur.I, sb=base.L*base.I;
    if(tgt && lvRank(cur.L,cur.I)<=lvRank(tgt.L,tgt.I) && sc<=tgt.L*tgt.I) return {k:"reach", t:"ถึง Target แล้ว", cls:"good"};
    if(sc<sb) return {k:"down", t:"ลดลงจาก Baseline · ยังไม่ถึง Target", cls:"blue"};
    if(sc===sb) return {k:"flat", t:"ยังไม่ลดลงจาก Baseline", cls:"high"};
    return {k:"up", t:"สูงขึ้นจาก Baseline", cls:"crit"}; }
  function actDoneBy(a, end){ if(a.status!=="done") return false; var l=a.log||[]; return (l.length ? l[l.length-1].d : ASOF).slice(0,7)<=end; }
  function riskQInfo(r, q){
    var s=riskAt(r, q.end), n=0, done=0, nk=0, nc=0;
    r.factors.forEach(function(f){ (f.acts||[]).forEach(function(a){ n++; if(actDoneBy(a, q.end)) done++; }); });
    r.kris.forEach(function(k){ var x=kriStAt(r, k, q.end); if(x.st!=="pending"){ nk++; if(x.st==="crit") nc++; } });
    var base=lvAt(r, q.end, "base"), tgt=lvAt(r, q.end, "target");
    return {r:r, s:s, n:n, done:done, nk:nk, nc:nc, base:base, tgt:tgt, v:lvVerdict(s, base, tgt), quad:(nc?"c":"o")+(n && done===n ? "d" : "n")};
  }
  function levelPathHtml(r){
    if(!QCUR || !RL[r.id]) return '';
    var qs=QUARTERS.filter(function(q){ return riskAt(r, q.end).exists; }), last=riskQInfo(r, QCUR), base=last.base, tgt=last.tgt;
    var LC={"l-crit":"crit","l-high":"high","l-mid":"watch","l-low":"good"};
    function step(k, o, tip, cls){ var lv=o?levelForLICorrect(o.L,o.I):null;
      return '<span class="lp2-s'+(cls?' '+cls:'')+'" title="'+escAttr(tip)+'"><span class="lp2-k">'+k+'</span> '+
        (o ? '<b class="lp2-lv '+LC[lv]+'">'+LV_NAME[lv]+'</b> <span class="mono lp2-li">'+o.L+'×'+o.I+'</span>' : '<span class="lp2-pend">รอ RMC เห็นชอบ</span>')+'</span>'; }
    function chg(o){ return o && o.chg ? ' · ปรับจาก '+o.chg.a[0]+'×'+o.chg.a[1]+' เมื่อ '+roundLabel(o.chg.p) : ''; }
    var arr='<span class="lp2-a" aria-hidden="true">→</span>';
    var steps=[step('Baseline', base, base ? base.mtg+' · '+thDate(base.d)+chg(base) : (BASE_PENDING[r.id]||'รอ RMC เห็นชอบ'))];
    qs.forEach(function(q){ var x=riskQInfo(r, q); steps.push(step(q.label, x.s, 'แนวทางเสร็จ '+x.done+'/'+x.n+(x.nk?' · KRI เกิน '+x.nc+'/'+x.nk:''), q===QCUR?'now':'')); });
    if(tgt) steps.push(step('Target', tgt, 'ภายใน '+monLabel(tgt.by)+chg(tgt), 'tgt'));
    var v=last.v, gap = v && v.k!=="reach" && tgt ? lvRank(last.s.L,last.s.I)-lvRank(tgt.L,tgt.I) : 0;
    return '<div class="lp2"><span class="lp2-h">ระดับความเสี่ยง</span><span class="lp2-steps">'+steps.join(arr)+'</span>'+
      (v ? '<span class="lp2-v"><span class="lp-verdict sm '+v.cls+'">'+v.t+'</span>'+(gap>0?' <span class="lp2-gap">ห่าง Target '+gap+' ระดับ</span>':'')+'</span>' : '')+'</div>';
  }

  /* ---------------- QUARTERLY REVIEW · 5 ขั้นตามกระบวนการทบทวนรายไตรมาส ----------------
     1 ข้อมูลรายเดือน → 2 ภาพรวมไตรมาส → 3 วิเคราะห์รายความเสี่ยง → 4 วาระเสนอ RMC → 5 บันทึกมติและปิดรอบ */
  var rvQ = QCUR ? QCUR.id : "", rvStep = 3, rvF3 = "need", rvF1 = "pend", rvCloseAsk = false, rvTab = "kri";
  var QUADS = [["cn","เร่งแนวทางจัดการ","high"],["cd","เสร็จแล้วแต่ KRI ยังเกิน","crit"],["on","ติดตามตามแผน","blue"],["od","ได้ผล · พิจารณาลดระดับหรือปิด","good"]];
  var CAN_REVIEW = "ให้ความเห็น Quarterly Review";
  function rvStore(){ return sessGet("prc-review", {}); }
  function rvGet(qid, key){ var s=rvStore()[qid]||{}; if(s[key]) return s[key]; return ((PRC.REVIEW_SEED||{})[qid]||{})[key] || null; }
  function rvSet(qid, key, patch){ var all=rvStore(), cur=rvGet(qid, key)||{t:"", rmc:false}, nx={t:cur.t, rmc:cur.rmc, own:cur.own, by:currentUser.name, at:ASOF};
    for(var k in patch) nx[k]=patch[k]; all[qid]=all[qid]||{}; all[qid][key]=nx; sessSet("prc-review", all); return cur; }
  function qClosed(q){ if(!q) return true; if(q!==QCUR) return {by:"Risk Management PCC", d:null, seed:true}; return sessGet("prc-qclose", {})[q.id] || null; }
  function rvEditable(q){ return q===QCUR && !qClosed(q) && !!currentUser && can(CAN_REVIEW); }
  function rvKriItems(infos, q){ var prevEnd=monthsBack(q.end, 3), out=[];
    infos.forEach(function(x){ x.r.kris.forEach(function(k, ki){ var a=kriStAt(x.r, k, prevEnd), b=kriStAt(x.r, k, q.end);
      out.push({key:"k|"+x.r.id+"|"+k.name, r:x.r, k:k, ki:ki, a:a, b:b, own: q===QCUR ? (k.note||"") : ((rvGet(q.id, "k|"+x.r.id+"|"+k.name)||{}).own||"")}); }); });
    return out; }
  function actMove(a, q){ var st=qStart(q), en=q.end, l=a.log||[], inQ=l.filter(function(e){ var m=e.d.slice(0,7); return m>=st && m<=en; });
    var dueQ=a.due.slice(0,7)>=st && a.due.slice(0,7)<=en;
    if(actDoneBy(a, en) && inQ.length && l[l.length-1].d.slice(0,7)>=st) return {k:"done", t:"เสร็จ", cls:"good", e:l[l.length-1]};
    if(dueQ && !actDoneBy(a, en) && (a.due<ASOF)) return {k:"late", t:"เลยกำหนด", cls:"crit", e:inQ[inQ.length-1]||null};
    if(!inQ.length) return null;
    return {k:"prog", t:"คืบหน้า", cls:"blue", e:inQ[inQ.length-1]}; }
  function rvActItems(infos, q){ var out=[];
    infos.forEach(function(x){ x.r.factors.forEach(function(f, fi){ (f.acts||[]).forEach(function(a, ai){ var mv=actMove(a, q); if(!mv) return;
      out.push({key:"a|"+x.r.id+"|"+f.responses[ai], r:x.r, t:f.responses[ai], a:a, mv:mv, fi:fi}); }); }); });
    return out; }
  function rvNeeds(it){ return it.b ? it.b.st==="crit" : it.mv.k==="late"; }
  function rvCell(q, it, edit){ var c=rvGet(q.id, it.key);
    if(edit) return '<textarea class="qr-cm" rows="'+Math.min(6, Math.max(2, Math.ceil(String(c&&c.t||"").length/34)))+'" data-rv-cm="'+escAttr(it.key)+'" aria-label="ความเห็น Risk ส่วนกลาง · '+escAttr(it.r.id)+'" placeholder="เขียนความเห็นหรือการตีความ">'+esc(c&&c.t||"")+'</textarea>';
    return c && c.t ? '<div class="qr-cmro">'+esc(c.t)+'</div>' : '<span class="qr-none">—</span>'; }
  function rvToggle(q, it, edit){ var c=rvGet(q.id, it.key), on=!!(c&&c.rmc);
    if(!edit) return on ? '<span class="qr-rmc on">เสนอ RMC</span>' : '<span class="qr-none">—</span>';
    return '<button type="button" class="qr-sw'+(on?' on':'')+'" role="switch" aria-checked="'+on+'" data-rv-rmc="'+escAttr(it.key)+'"><i aria-hidden="true"></i>'+(on?'เสนอ':'ไม่เสนอ')+'</button>'; }
  function rvLevelTiny(x){ return x.v ? '<span class="lp-verdict sm '+x.v.cls+'">'+x.v.t+'</span>' : '<span class="lp-verdict sm pend">รอ Baseline</span>'; }
  function rvInfos(q){ return filteredRisks().filter(function(r){ return riskAt(r, q.end).exists; }).map(function(r){ return riskQInfo(r, q); }); }
  function rvAgendaGroups(){ var q=qById(rvQ)||QCUR, infos=rvInfos(q);
    var items=rvKriItems(infos, q).concat(rvActItems(infos, q)).filter(function(it){ var c=rvGet(q.id, it.key); return c && c.rmc; }), g=[], by={};
    items.forEach(function(it){ if(!by[it.r.id]){ by[it.r.id]={x:infos.filter(function(x){ return x.r===it.r; })[0], items:[]}; g.push(by[it.r.id]); } by[it.r.id].items.push(it); });
    g.sort(function(a,b){ return riskScore(b.x.r)-riskScore(a.x.r) || (a.x.r.id<b.x.r.id?-1:1); });
    return {q:q, g:g, n:items.length, infos:infos}; }
  function rvItemLine(q, it){ var c=rvGet(q.id, it.key)||{};
    var what = it.b ? 'KRI '+it.k.name+' · '+(it.b.v===null?'—':hFmt(it.b.v,it.b.u))+' · '+({crit:"เกิน Tolerance", watch:"เฝ้าระวัง", good:"ปกติ", pending:"รอข้อมูล"})[it.b.st] : 'แนวทางจัดการ '+it.t+' · '+it.mv.t;
    return {what:what, own:it.own||(it.mv&&it.mv.e&&it.mv.e.note)||"", cm:c.t||""}; }
  function prevQLabel(q){ var i=QUARTERS.indexOf(q); return i>0 ? QUARTERS[i-1].label : 'สิ้น '+roundLabel(monthsBack(q.end, 3)); }
  function rvPathTxt(x, q){ var LC={"l-crit":"crit","l-high":"high","l-mid":"watch","l-low":"good"};
    function s(k, o, cur){ if(!o) return '<span>'+k+' <b class="lp2-pend">รอ RMC</b></span>'; var lv=levelForLICorrect(o.L,o.I);
      return '<span class="'+(cur?'rv3-cur':'')+'">'+k+' <b class="lp2-lv '+LC[lv]+'">'+LV_NAME[lv]+'</b> <span class="mono">'+o.L+'×'+o.I+'</span></span>'; }
    var p=riskAt(x.r, monthsBack(q.end, 3)), arr='<span class="lp2-a" aria-hidden="true">→</span>';
    return '<span class="rv3-path">'+[s('Baseline', x.base), p.exists ? s(prevQLabel(q), p) : '', s(q.label, x.s, true), x.tgt ? s('Target', x.tgt) : ''].filter(Boolean).join(arr)+'</span>'; }
  /* ขั้นที่ 1 · ข้อมูลรายเดือน */
  function rvReady(q){ var ms=[monthsBack(q.end,2), monthsBack(q.end,1), q.end], cur=q===QCUR;
    return rvInfos(q).map(function(x){ var st=ms.map(function(m, i){ if(!riskAt(x.r, m).exists) return "none"; if(cur && i===2){ var f=flowOf(x.r); return f.state==="none" ? "confirmed" : f.state; } return "confirmed"; });
      return {x:x, ms:ms, st:st, ok:st.every(function(s){ return s==="confirmed" || s==="none"; })}; }); }
  function step1Html(q, edit){ var rows=rvReady(q), nOk=rows.filter(function(r){ return r.ok; }).length, shown=rows.filter(function(r){ return rvF1==="all" || !r.ok; });
    var chips='<div class="rf-chips">'+[["pend","ยังไม่ส่งส่วนกลาง", rows.length-nOk],["all","ทั้งหมด", rows.length]].map(function(c){ return '<button type="button" class="rf-chip'+(rvF1===c[0]?' on':'')+'" data-rv-f1="'+c[0]+'" aria-pressed="'+(rvF1===c[0])+'">'+c[1]+'<span class="rf-n">'+c[2]+'</span></button>'; }).join('')+'</div>';
    var ms=rows.length?rows[0].ms:[];
    var tbl = shown.length ? '<div class="qr-tw"><table class="qr-t rv1-t"><thead><tr><th>ความเสี่ยง</th><th>Risk Owner</th><th>ผู้ตรวจ</th>'+ms.map(function(m){ return '<th>'+roundLabel(m)+'</th>'; }).join('')+(edit?'<th></th>':'')+'</tr></thead><tbody>'+
      shown.map(function(r){ return '<tr><td><button type="button" class="qr-rid mono" data-risk="'+r.x.r.id+'">'+r.x.r.id+'</button><div class="rv1-t2">'+esc(r.x.r.title)+'</div></td><td class="qr-own">'+esc(r.x.r.owner||"")+'</td><td class="qr-own">'+esc(coordName(r.x.r))+'</td>'+
        r.st.map(function(s){ return '<td>'+(s==="none" ? '<span class="qr-none">—</span>' : '<span class="flow-st '+FLOW_CLS[s]+'">'+FLOW_LBL[s]+'</span>')+'</td>'; }).join('')+
        (edit ? '<td>'+(r.ok ? '' : '<button type="button" class="ra-btn sm" data-rv-remind="'+r.x.r.id+'">แจ้งเตือน</button>')+'</td>' : '')+'</tr>'; }).join('')+'</tbody></table></div>'
      : '<div class="rv-okmsg">'+icon("check")+'รายงานประจำเดือนของทุกความเสี่ยงส่งถึงส่วนกลางครบแล้ว</div>';
    return '<div class="rv-bar"><h3>ข้อมูลรายเดือน</h3>'+chips+'<span class="qr-prog">ส่งส่วนกลางแล้ว <b>'+nOk+'</b> จาก '+rows.length+' ความเสี่ยง</span></div>'+
      '<p class="rv-help">รายงานประจำเดือน (ค่า KRI + ความคืบหน้าแนวทางจัดการ) ต้องผ่าน Risk Owner → Coordinator → ส่วนกลาง ครบทั้ง 3 เดือนก่อนเริ่มวิเคราะห์</p>'+tbl+rvNext(q, 2); }
  /* ขั้นที่ 2 · ภาพรวมไตรมาส */
  function step2Html(q){ var infos=rvInfos(q), quadN={}; infos.forEach(function(x){ (quadN[x.quad]=quadN[x.quad]||[]).push(x); });
    function qc(k){ var d=QUADS.filter(function(x){ return x[0]===k; })[0], xs=quadN[k]||[];
      return '<div class="qr-qc '+d[2]+(xs.length?'':' zero')+'"><button type="button" class="qr-qh" data-rv-quad="'+k+'"'+(xs.length?'':' disabled')+' title="ดูในขั้นที่ 3"><b class="mono">'+xs.length+'</b>'+d[1]+'</button>'+
        (xs.length ? '<div class="qr-ids">'+xs.slice(0,6).map(function(x){ return '<button type="button" class="mono" data-risk="'+x.r.id+'" title="'+escAttr(x.r.title)+'">'+x.r.id+'</button>'; }).join('')+(xs.length>6?'<span>+'+(xs.length-6)+'</span>':'')+'</div>' : '')+'</div>'; }
    var vc={reach:0, down:0, flat:0, up:0, pend:0}; infos.forEach(function(x){ vc[x.v?x.v.k:"pend"]++; });
    return '<div class="rv-bar"><h3>ภาพรวมไตรมาส '+q.label+'</h3></div>'+
      '<div class="qr-2x2"><div></div><div class="qr-ch">แนวทางจัดการยังไม่เสร็จ</div><div class="qr-ch">แนวทางจัดการเสร็จครบ</div>'+
        '<div class="qr-rh">KRI เกิน Tolerance</div>'+qc("cn")+qc("cd")+'<div class="qr-rh">KRI ไม่เกิน</div>'+qc("on")+qc("od")+'</div>'+
      '<div class="qr-lv"><span class="qr-lvh">ระดับความเสี่ยงเทียบ Baseline / Target</span><span>ถึง Target แล้ว <b class="mono">'+vc.reach+'</b></span><span>ลดลง ยังไม่ถึง Target <b class="mono">'+vc.down+'</b></span><span>ยังไม่ลดลง <b class="mono">'+vc.flat+'</b></span><span class="qr-up">สูงขึ้นจาก Baseline <b class="mono">'+vc.up+'</b></span>'+(vc.pend?'<span>รอ Baseline <b class="mono">'+vc.pend+'</b></span>':'')+'</div>'+
      '<h4 class="rv-h4">อะไรเปลี่ยนในไตรมาสนี้</h4>'+renderRevCompare(filteredRisks(), monthsBack(q.end, 3), q.end)+rvNext(q, 3); }
  /* ขั้นที่ 3 · วิเคราะห์รายความเสี่ยง */
  function step3Html(q, edit){ var infos=rvInfos(q), kAll=rvKriItems(infos, q), aAll=rvActItems(infos, q).filter(function(it){ return it.mv.k!=="prog"; });
    var needs=kAll.filter(rvNeeds).concat(aAll.filter(rvNeeds)), nDone=needs.filter(function(it){ var c=rvGet(q.id, it.key); return c && String(c.t).trim(); }).length;
    function needR(x){ return needs.some(function(it){ return it.r===x.r; }); }
    var cnt={need:infos.filter(needR).length, all:infos.length}; QUADS.forEach(function(d){ cnt[d[0]]=infos.filter(function(x){ return x.quad===d[0]; }).length; });
    var F=[["need","ต้องดู"]].concat(QUADS.map(function(d){ return [d[0], d[1]]; })).concat([["all","ทั้งหมด"]]);
    var chips='<div class="rf-chips">'+F.map(function(c){ var on=rvF3===c[0]; return '<button type="button" class="rf-chip'+(on?' on':'')+'" data-rv-f3="'+c[0]+'" aria-pressed="'+on+'">'+c[1]+'<span class="rf-n">'+cnt[c[0]]+'</span></button>'; }).join('')+'</div>';
    var sel=infos.filter(function(x){ return rvF3==="all" ? true : rvF3==="need" ? needR(x) : x.quad===rvF3; });
    var blocks=sel.map(function(x){ var its=kAll.filter(function(it){ return it.r===x.r; }).concat(aAll.filter(function(it){ return it.r===x.r; }));
      var qd=QUADS.filter(function(d){ return d[0]===x.quad; })[0];
      var rows=its.map(function(it){ var n=rvNeeds(it);
        var name = it.b ? '<span class="rv3-kind">KRI'+(it.k.f?' · ปัจจัย '+it.k.f:'')+'</span>'+esc(it.k.name) : '<span class="rv3-kind">แนวทางจัดการ</span>'+esc(it.t);
        var val = it.b ? '<span class="mono">'+(it.a.v===null?'—':hFmt(it.a.v,it.a.u))+' → '+(it.b.v===null?'—':hFmt(it.b.v,it.b.u))+'</span>'+statusPill(it.b.st)
          : '<span class="qr-mvk '+it.mv.cls+'">'+it.mv.t+'</span><span class="rv3-sub">กำหนด '+thDate(it.a.due)+(it.a.pct!=null&&it.mv.k!=="done"?' · คืบหน้า '+it.a.pct+'%':'')+'</span>';
        var own = it.b ? it.own : (it.mv.e ? it.mv.e.note : "");
        return '<div class="rv3-r'+(n?' need':'')+'"><div class="rv3-c rv3-name">'+name+'</div><div class="rv3-c rv3-val">'+val+'</div><div class="rv3-c qr-own">'+(own?esc(own):'<span class="qr-none">—</span>')+'</div>'+
          '<div class="rv3-c">'+rvCell(q, it, edit)+'</div><div class="rv3-c rv3-tg">'+rvToggle(q, it, edit)+'</div></div>'; }).join('');
      return '<section class="rv3"><div class="rv3-h"><button type="button" class="qr-rid mono" data-risk="'+x.r.id+'">'+x.r.id+'</button><span class="rv3-t">'+esc(x.r.title)+'</span>'+
          '<div class="rv3-meta">'+rvPathTxt(x, q)+rvLevelTiny(x)+'<span class="rv3-quad '+qd[2]+'">'+qd[1]+'</span></div></div>'+
        '<div class="rv3-hd" aria-hidden="true"><span>รายการ</span><span>'+prevQLabel(q)+' → '+q.label+'</span><span>คำชี้แจงจาก Risk Owner</span><span>ความเห็น Risk ส่วนกลาง</span><span>เสนอ RMC</span></div>'+
        (rows||'<div class="ov-none">ไม่มีรายการในไตรมาสนี้</div>')+'</section>'; }).join('');
    return '<div class="rv-bar"><h3>วิเคราะห์รายความเสี่ยง</h3>'+chips+'<span class="qr-prog" title="รายการที่ต้องดู = KRI เกิน Tolerance และแนวทางจัดการที่เลยกำหนด">ให้ความเห็นแล้ว <b>'+nDone+'</b> จาก '+needs.length+' รายการที่ต้องดู</span></div>'+
      (blocks || emptyState('ไม่มีความเสี่ยงตามตัวกรองนี้'))+rvNext(q, 4, edit ? 'ความเห็นบันทึกอัตโนมัติ' : ''); }
  /* ขั้นที่ 4 · วาระเสนอ RMC */
  function agendaHtml(A){ var q=A.q;
    return A.g.map(function(G, gi){ var x=G.x;
      return '<section class="ag-r"><div class="ag-h"><span class="ag-no mono">'+(gi+1)+'</span><button type="button" class="qr-rid mono" data-risk="'+x.r.id+'">'+x.r.id+'</button><b>'+esc(x.r.title)+'</b></div>'+
        '<div class="ag-lv">'+rvPathTxt(x, q)+rvLevelTiny(x)+'</div>'+
        '<ol class="ag-list">'+G.items.map(function(it){ var L=rvItemLine(q, it); return '<li><div class="ag-what">'+esc(L.what)+'</div>'+(L.own?'<div class="ag-own"><span>Risk Owner</span>'+esc(L.own)+'</div>':'')+'<div class="ag-cm"><span>Risk ส่วนกลาง</span>'+(L.cm?esc(L.cm):'—')+'</div></li>'; }).join('')+'</ol></section>'; }).join(''); }
  function step4Html(q){ var A=rvAgendaGroups(), canX=currentUser && can("Export รายงาน");
    var tools='<span class="qr-prog">'+A.g.length+' ความเสี่ยง · '+A.n+' รายการ</span>'+(canX?'<button type="button" class="ra-btn primary" data-rv-slides="1"'+(A.g.length?'':' disabled')+'>'+icon("download")+'สร้างสไลด์ RMC</button>':'');
    return '<div class="rv-bar"><h3>วาระเสนอ RMC · '+esc(q.rmc)+'</h3>'+tools+'</div>'+
      '<p class="rv-help">รวมเฉพาะรายการที่กด "เสนอ" ในขั้นที่ 3 เรียงตามระดับความเสี่ยง · กรรมการ RMC เปิดดูหน้านี้ในระบบได้ · สไลด์มีปก ภาพรวม Heat Map สิ่งที่เปลี่ยน และหนึ่งสไลด์ต่อความเสี่ยงที่เสนอ</p>'+
      (A.g.length ? agendaHtml(A) : '<div class="ov-none">ยังไม่มีรายการที่เลือกเสนอ RMC · <button type="button" class="rf-clear" data-rv-step="3">ไปเลือกในขั้นที่ 3</button></div>')+rvNext(q, 5); }
  /* ขั้นที่ 5 · บันทึกมติและปิดรอบ */
  function step5Html(q, edit){ var st=qStart(q), en=q.end, cl=qClosed(q);
    var decs=REV.filter(function(c){ return c.p>=st && c.p<=en && ["LI","base","target","app","tol"].indexOf(c.t)!==-1 && riskById(c.rid) && inSel(activeFilter, riskById(c.rid).sub); });
    var dl = decs.length ? decs.map(function(c){ var r=riskById(c.rid), chg = c.t==="LI" ? 'ระดับ '+c.a.join('×')+' → '+c.b.join('×') : revTxt(c)+(c.k&&(c.t==="app"||c.t==="tol")?' ('+c.k+')':'');
        return rvRow(c.rid, r?r.title:'', '<span class="mono">'+esc(chg)+'</span>', (c.note||'')+' · '+roundLabel(c.p)); }).join('') : '<div class="ov-none">ยังไม่มีมติที่บันทึกในไตรมาสนี้</div>';
    var ye = YE && q===QCUR && q.end.slice(5)==="12" ? '<div class="rv-closebar"><span>การทบทวนความเสี่ยงประจำปี '+YE.from+' → Risk Profile '+YE.to+' ทำแยกที่เมนู Yearly Review</span><a class="ra-btn sm" href="yearly.html" data-page="yearly">ไป Yearly Review →</a></div>' : '';
    var close;
    if(cl) close='<div class="rv-closed">'+icon("lock")+'<div><b>ปิดรอบ '+q.label+' แล้ว</b>'+(cl.seed?'เสนอ '+esc(q.rmc)+' · ข้อมูลของไตรมาสนี้อ่านอย่างเดียว':'โดย '+esc(cl.by)+' · '+thDate(cl.d)+' · ความเห็นและการเลือกเสนอ RMC ถูกล็อก')+'</div></div>';
    else if(!edit) close='<div class="rv-help">รอ Risk ส่วนกลางปิดรอบหลังประชุม '+esc(q.rmc)+'</div>';
    else if(rvCloseAsk) close='<div class="rv-ask" role="alert"><div><b>ยืนยันปิดรอบ '+q.label+'?</b>หลังปิดรอบจะแก้ความเห็น การเลือกเสนอ RMC และการทบทวนสิ้นปีไม่ได้</div><button type="button" class="ra-btn" data-rv-close="no">ยกเลิก</button><button type="button" class="ra-btn primary" data-rv-close="yes">'+icon("lock")+'ปิดรอบ</button></div>';
    else close='<div class="rv-closebar"><span>ทำหลังประชุม '+esc(q.rmc)+' และบันทึกมติครบแล้ว</span><button type="button" class="ra-btn" data-rv-close="ask">'+icon("lock")+'ปิดรอบ '+q.label+'</button></div>';
    var A=rvAgendaGroups(), res=A.g.map(function(G, gi){ var m=rvGet(q.id, "m|"+G.x.r.id)||{};
      var chips = edit ? '<div class="rv5-res" role="group" aria-label="มติ RMC '+G.x.r.id+'">'+RMC_RES.map(function(o){ var on=m.res===o; return '<button type="button" class="'+(on?'on':'')+'" aria-pressed="'+on+'" data-rv-res="'+G.x.r.id+'|'+o+'">'+o+'</button>'; }).join('')+'</div>'
        : (m.res ? '<span class="rv5-rro">'+esc(m.res)+'</span>' : '<span class="qr-none">ยังไม่บันทึก</span>');
      var txt = edit ? '<textarea class="qr-cm" rows="2" data-rv-mt="'+G.x.r.id+'" aria-label="รายละเอียดมติ RMC · '+G.x.r.id+'" placeholder="รายละเอียดมติหรือความเห็นของ RMC เช่น มอบหมายให้ใคร ทำอะไร เมื่อไร">'+esc(m.t||"")+'</textarea>' : (m.t ? '<div class="qr-cmro">'+esc(m.t)+'</div>' : '');
      return '<div class="rv5-m"><div class="rv5-mh"><span class="ag-no mono">'+(gi+1)+'</span><button type="button" class="qr-rid mono" data-risk="'+G.x.r.id+'">'+G.x.r.id+'</button><span>'+esc(G.x.r.title)+'</span></div>'+chips+txt+'</div>'; }).join('');
    var nRes=A.g.filter(function(G){ var m=rvGet(q.id, "m|"+G.x.r.id); return m && m.res; }).length;
    return '<div class="rv-bar"><h3>บันทึกมติและปิดรอบ</h3></div>'+
      '<p class="rv-help">หลังประชุม '+esc(q.rmc)+' บันทึกมติของแต่ละวาระ ถ้ามติให้ปรับระดับหรือเกณฑ์ ให้บันทึกในส่วนถัดไปด้วย ทุกอย่างลง Audit Trail อัตโนมัติ</p>'+
      '<h4 class="rv-h4">มติ RMC ต่อวาระที่เสนอ <span class="rf-n">'+nRes+'/'+A.g.length+'</span></h4>'+(res||'<div class="ov-none">ไม่มีวาระที่เสนอในไตรมาสนี้</div>')+
      '<div class="rv-h4 rv5-h"><span>การปรับระดับและเกณฑ์ตามมติ <span class="rf-n">'+decs.length+'</span></span>'+(edit?'<button type="button" class="ra-btn sm" data-rd-open="1">'+icon("gavel")+'บันทึกการปรับ</button>':'')+'</div><div class="rv5-list">'+dl+'</div>'+ye+'<h4 class="rv-h4">ปิดรอบ</h4>'+close; }
  var RMC_RES = ["รับทราบ","เห็นชอบตามเสนอ","ให้ทบทวนแนวทางจัดการ","ขอข้อมูลเพิ่มเติม"];
  function rmcNoteOf(r){ for(var i=QUARTERS.length-1; i>=0; i--){ var q=QUARTERS[i], m=rvGet(q.id, "m|"+r.id); if(m && (m.res||m.t)) return 'มติ '+String(q.rmc||'').split(' · ')[0]+' ('+q.label+'): '+(m.res||'')+(m.t?' · '+m.t:''); } return r.rmc||''; }
  function rvNext(q, n, note){ if(n>5) return ''; var t={2:"ภาพรวมไตรมาส",3:"วิเคราะห์รายความเสี่ยง",4:"วาระเสนอ RMC",5:"บันทึกมติและปิดรอบ"}[n];
    return '<div class="rv-next"><span>'+(note||'')+'</span><button type="button" class="ra-btn" data-rv-step="'+n+'">ขั้นที่ '+n+' · '+t+' →</button></div>'; }
  function renderReview(){
    var q=qById(rvQ)||QCUR; if(!q) return emptyState('ยังไม่มีข้อมูลไตรมาส');
    var edit=rvEditable(q), cl=qClosed(q), infos=rvInfos(q);
    /* สถานะของแต่ละขั้น */
    var ready=rvReady(q), nOk=ready.filter(function(r){ return r.ok; }).length;
    var g=revCompare(monthsBack(q.end,3), q.end, filteredRisks()), nChg=0; for(var k in g) nChg+=g[k].length;
    var kAll=rvKriItems(infos, q), aAll=rvActItems(infos, q), needs=kAll.filter(rvNeeds).concat(aAll.filter(rvNeeds)), nDone=needs.filter(function(it){ var c=rvGet(q.id, it.key); return c && String(c.t).trim(); }).length;
    var A=rvAgendaGroups();
    var S=[
      {n:1, t:"ข้อมูลรายเดือน", s: nOk===ready.length ? "done" : "warn", d:'ส่งส่วนกลางแล้ว '+nOk+'/'+ready.length+(nOk<ready.length?' · รอ '+(ready.length-nOk):'')},
      {n:2, t:"ภาพรวมไตรมาส", s:"info", d:'เปลี่ยน '+nChg+' รายการ · สูงขึ้น '+g.up.length},
      {n:3, t:"วิเคราะห์รายความเสี่ยง", s: needs.length && nDone>=needs.length ? "done" : "todo", d:'ความเห็น '+nDone+'/'+needs.length+' รายการที่ต้องดู'},
      {n:4, t:"วาระเสนอ RMC", s: A.n ? "done" : "todo", d:'เลือกแล้ว '+A.n+' รายการ · '+A.g.length+' ความเสี่ยง'},
      {n:5, t:"บันทึกมติและปิดรอบ", s: cl ? "done" : "todo", d: cl ? 'ปิดรอบแล้ว' : 'มติ '+A.g.filter(function(G){ var m=rvGet(q.id, "m|"+G.x.r.id); return m && m.res; }).length+'/'+A.g.length+' วาระ · ประชุม '+String(q.rmc||'').split(' · ').slice(1).join(' · ')}];
    var steps='<nav class="rv-steps" aria-label="ขั้นตอนการทบทวน">'+S.map(function(x){ var on=rvStep===x.n;
      return '<button type="button" class="rv-st '+x.s+(on?' cur':'')+'" data-rv-step="'+x.n+'"'+(on?' aria-current="step"':'')+'><span class="rv-n" aria-hidden="true">'+(x.s==="done"&&!on?'✓':x.n)+'</span><span class="rv-sx"><b>'+x.t+'</b><span>'+x.d+'</span></span></button>'; }).join('')+'</nav>';
    var qsel='<label class="qr-q"><span class="sr-only">ไตรมาส</span><select class="rf-sel" id="rvQ">'+QUARTERS.map(function(x){ return '<option value="'+x.id+'"'+(x===q?' selected':'')+'>ไตรมาส '+x.label+' · '+x.months+'</option>'; }).join('')+'</select></label>';
    var chip = cl ? '<span class="rv-qst closed">'+icon("lock")+'ปิดรอบแล้ว · '+esc(q.rmc)+'</span>' : '<span class="rv-qst">กำลังทบทวน · '+esc(q.rmc)+'</span>';
    var head='<div class="page-head"><div><h2>Quarterly Review</h2><div class="sub">ทบทวนความเสี่ยงรายไตรมาส ตั้งแต่ตรวจข้อมูลจนปิดรอบหลังประชุม RMC</div></div><div class="qr-ctl">'+qsel+chip+'</div></div>';
    var toolbar='<div class="rf tb">'+companyRow(function(id){ return scopeRisks().filter(function(r){ return (id==="ALL"||r.sub===id) && riskAt(r, q.end).exists; }).length; })+'</div>';
    var ro='';
    if(!edit && rvStep>=3){ if(cl && q!==QCUR) ro='<div class="rv-ro">'+icon("lock")+'<div><b>'+q.label+' ปิดรอบแล้ว · ดูย้อนหลังได้อย่างเดียว</b>ความเห็นและมติของไตรมาสนี้บันทึกไว้แล้ว แก้ไขไม่ได้</div>'+(QCUR?'<button type="button" class="ra-btn sm primary" data-rv-cur="1">ไปไตรมาสปัจจุบัน '+QCUR.label+'</button>':'')+'</div>';
      else if(cl) ro='<div class="rv-ro">'+icon("lock")+'<div><b>'+q.label+' ปิดรอบแล้ว</b>ความเห็นและมติถูกล็อก</div></div>';
      else ro='<div class="rv-ro">'+icon("eye")+'<div><b>ดูได้อย่างเดียว</b>ความเห็นและการเลือกเสนอ RMC เขียนโดย Risk ส่วนกลาง (สิทธิ์ Admin)</div></div>'; }
    var body = rvStep===1 ? step1Html(q, edit) : rvStep===2 ? step2Html(q) : rvStep===4 ? step4Html(q) : rvStep===5 ? step5Html(q, edit) : step3Html(q, edit);
    return head+toolbar+steps+'<div class="card rv-body">'+ro+body+'</div>'+renderRiskModal();
  }
  /* สไลด์ RMC (.pptx) */
  function rvSlides(){ var A=rvAgendaGroups(), q=A.q; if(!A.g.length) return;
    toast("กำลังสร้างสไลด์");
    function logoData(){ return fetch("img/logo-h.png").then(function(r){ return r.ok ? r.blob() : null; }).then(function(b){ return !b ? null : new Promise(function(res){ var fr=new FileReader(); fr.onload=function(){ res(fr.result); }; fr.onerror=function(){ res(null); }; fr.readAsDataURL(b); }); }).catch(function(){ return null; }); }
    Promise.all([loadLib("pptx"), logoData()]).then(function(v){ var logo=v[1];
      var P=new window.PptxGenJS(); P.layout="LAYOUT_WIDE"; P.author="Risk Management PCC"; P.title="รายงานความเสี่ยงองค์กร "+q.label;
      var F="Tahoma", NAVY="1F236B", BRAND="2250B4", INK="14161C", MUT="6B7280", LINE="D5DAE3", SOFT="F6F7F9";
      var LV={"l-crit":["D92D20","FBE6E3","8A1C14"],"l-high":["E6870C","FDEFD9","8A4A05"],"l-mid":["CAA400","FBF2CF","7A5B00"],"l-low":["1A9A51","E2F4E8","0F5B32"]};
      var ST={crit:["เกิน Tolerance","8A1C14","FBE6E3"],watch:["เฝ้าระวัง","7A5B00","FBF2CF"],good:["ปกติ","0F5B32","E2F4E8"],pending:["รอข้อมูล","5B6472","EEF1F3"]};
      function T(s, text, o){ var x={fontFace:F, fontSize:12, color:INK, margin:0, isTextBox:true, valign:"top"}; for(var k in o) x[k]=o[k]; s.addText(text, x); }
      var pageNo=0;
      function frame(title, sub, small){ var s=P.addSlide(); s.background={color:"FFFFFF"}; pageNo++;
        T(s, title, {x:0.6, y:0.3, w:12.1, h:small?0.9:0.7, fontSize:small?19:24, bold:true, color:NAVY, valign:"middle"});
        if(sub) T(s, sub, {x:0.6, y:1.05, w:12.1, h:0.35, fontSize:12, color:MUT});
        T(s, "Precise · รายงานความเสี่ยงองค์กร "+q.label+" · "+(q.rmc||""), {x:0.6, y:7.0, w:9, h:0.3, fontSize:9, color:MUT});
        T(s, String(pageNo+1), {x:12.2, y:7.0, w:0.5, h:0.3, fontSize:9, color:MUT, align:"right"}); return s; }
      function lvBox(s, x, y, w, h, label, o, cur){ var c=o ? LV[levelForLICorrect(o.L,o.I)] : ["B7BEC7","EEF1F3","5B6472"];
        s.addShape(P.ShapeType.roundRect, {x:x, y:y, w:w, h:h, rectRadius:0.08, fill:{color:c[1]}, line:{color:cur?c[0]:c[1], width:cur?1.5:0.75}});
        T(s, label, {x:x+0.15, y:y+0.1, w:w-0.3, h:0.28, fontSize:10.5, color:MUT});
        T(s, o ? LV_NAME[levelForLICorrect(o.L,o.I)]+"  "+o.L+"×"+o.I : "รอ RMC เห็นชอบ", {x:x+0.15, y:y+0.38, w:w-0.3, h:0.4, fontSize:15, bold:true, color:c[2]}); }
      /* 1 · ปก */
      var s=P.addSlide(); s.background={color:NAVY};
      if(logo){ s.addShape(P.ShapeType.roundRect, {x:0.8, y:0.7, w:3.0, h:0.75, rectRadius:0.1, fill:{color:"FFFFFF"}, line:{color:"FFFFFF"}}); s.addImage({data:logo, x:1.0, y:0.86, w:2.6, h:0.41}); }
      T(s, "รายงานความเสี่ยงองค์กร", {x:0.8, y:2.5, w:11.5, h:1.0, fontSize:40, bold:true, color:"FFFFFF"});
      T(s, "ไตรมาส "+q.label+" ("+q.months+")", {x:0.8, y:3.55, w:11.5, h:0.6, fontSize:22, color:"CADCFC"});
      T(s, "เสนอ "+(q.rmc||"คณะกรรมการบริหารความเสี่ยง"), {x:0.8, y:4.25, w:11.5, h:0.5, fontSize:16, color:"FFFFFF"});
      T(s, "ข้อมูล ณ "+asofFull()+" · จัดทำโดย Risk Management PCC", {x:0.8, y:6.6, w:11.5, h:0.4, fontSize:11, color:"AEB5CF"});
      /* 2 · ภาพรวม */
      var infos=A.infos, byLv={"สูงมาก":0,"สูง":0,"ปานกลาง":0,"ต่ำ":0}; infos.forEach(function(x){ byLv[LV_NAME[levelForLICorrect(x.s.L,x.s.I)]]++; });
      s=frame("ภาพรวมไตรมาส "+q.label, infos.length+" ความเสี่ยงระดับองค์กร · ระดับ ณ สิ้น"+roundLabel(q.end));
      [["สูงมาก","l-crit"],["สูง","l-high"],["ปานกลาง","l-mid"],["ต่ำ","l-low"]].forEach(function(l, i){ var c=LV[l[1]], x=0.6+i*3.05;
        s.addShape(P.ShapeType.roundRect, {x:x, y:1.6, w:2.85, h:1.35, rectRadius:0.08, fill:{color:c[1]}, line:{color:c[1]}});
        T(s, String(byLv[l[0]]), {x:x+0.2, y:1.7, w:2.4, h:0.75, fontSize:36, bold:true, color:c[2]});
        T(s, "ระดับ"+l[0], {x:x+0.2, y:2.45, w:2.4, h:0.35, fontSize:13, color:c[2]}); });
      var qn={}; infos.forEach(function(x){ qn[x.quad]=(qn[x.quad]||0)+1; });
      T(s, "KRI × แนวทางจัดการ", {x:0.6, y:3.3, w:7.3, h:0.35, fontSize:13, bold:true, color:NAVY});
      T(s, "แนวทางยังไม่เสร็จ", {x:2.5, y:3.7, w:2.7, h:0.3, fontSize:10.5, color:MUT}); T(s, "แนวทางเสร็จครบ", {x:5.3, y:3.7, w:2.7, h:0.3, fontSize:10.5, color:MUT});
      [["KRI เกิน Tolerance","cn","cd"],["KRI ไม่เกิน","on","od"]].forEach(function(row, ri){ var y=4.05+ri*1.25; T(s, row[0], {x:0.6, y:y+0.35, w:1.8, h:0.5, fontSize:11, bold:true, color:INK});
        [row[1], row[2]].forEach(function(k, ci){ var d=QUADS.filter(function(z){ return z[0]===k; })[0], col={high:["FDEFD9","8A4A05"],crit:["FBE6E3","8A1C14"],blue:["E6EAFC","233A95"],good:["E2F4E8","0F5B32"]}[d[2]];
          s.addShape(P.ShapeType.roundRect, {x:2.5+ci*2.8, y:y, w:2.7, h:1.1, rectRadius:0.08, fill:{color:col[0]}, line:{color:col[0]}});
          T(s, String(qn[k]||0), {x:2.65+ci*2.8, y:y+0.08, w:2.4, h:0.5, fontSize:22, bold:true, color:col[1]});
          T(s, d[1], {x:2.65+ci*2.8, y:y+0.6, w:2.4, h:0.45, fontSize:10.5, color:col[1]}); }); });
      var vc={reach:0, down:0, flat:0, up:0, pend:0}; infos.forEach(function(x){ vc[x.v?x.v.k:"pend"]++; });
      T(s, "ระดับเทียบ Baseline / Target", {x:8.5, y:3.3, w:4.2, h:0.35, fontSize:13, bold:true, color:NAVY});
      [["ถึง Target แล้ว", vc.reach, "0F5B32"],["ลดลง ยังไม่ถึง Target", vc.down, "233A95"],["ยังไม่ลดลง", vc.flat, "8A4A05"],["สูงขึ้นจาก Baseline", vc.up, "8A1C14"]].concat(vc.pend?[["รอ Baseline", vc.pend, "5B6472"]]:[]).forEach(function(r, i){
        T(s, r[0], {x:8.5, y:3.8+i*0.52, w:3.2, h:0.45, fontSize:12.5, color:INK, valign:"middle"}); T(s, String(r[1]), {x:11.7, y:3.8+i*0.52, w:1.0, h:0.45, fontSize:18, bold:true, color:r[2], align:"right", valign:"middle"}); });
      /* 3 · Heat Map */
      s=frame("Heat Map ความเสี่ยง "+q.label, "L = โอกาสเกิด · I = ผลกระทบ · ณ สิ้น"+roundLabel(q.end));
      var cw=2.55, ch=1.2, x0=1.9, y0=1.65;
      for(var L=4; L>=1; L--) for(var I=1; I<=4; I++){ var c=LV[levelForLICorrect(L,I)], cx=x0+(I-1)*cw, cy=y0+(4-L)*ch, ids=infos.filter(function(z){ return z.s.L===L && z.s.I===I; }).map(function(z){ return z.r.id; });
        s.addShape(P.ShapeType.rect, {x:cx, y:cy, w:cw-0.06, h:ch-0.06, fill:{color:c[1]}, line:{color:"FFFFFF", width:0}});
        if(ids.length) T(s, ids.join("\n"), {x:cx+0.08, y:cy+0.06, w:cw-0.22, h:ch-0.18, fontSize: ids.length>4 ? 8 : 9.5, color:c[2], bold:true}); }
      for(var i2=1; i2<=4; i2++){ T(s, "I"+i2, {x:x0+(i2-1)*cw, y:y0+4*ch+0.05, w:cw, h:0.3, fontSize:11, color:MUT, align:"center"}); T(s, "L"+(5-i2), {x:x0-0.55, y:y0+(i2-1)*ch+0.4, w:0.45, h:0.35, fontSize:11, color:MUT, align:"right"}); }
      /* 4 · อะไรเปลี่ยน */
      var G=revCompare(monthsBack(q.end,3), q.end, filteredRisks());
      s=frame("อะไรเปลี่ยนในไตรมาส "+q.label, "เทียบสิ้น"+roundLabel(monthsBack(q.end,3))+" กับสิ้น"+roundLabel(q.end));
      function lst(title, arr, x, y, w){ T(s, title+"  ("+arr.length+")", {x:x, y:y, w:w, h:0.35, fontSize:13, bold:true, color:NAVY});
        var lines=arr.slice(0,6).map(function(t){ return {text:t, options:{bullet:true, breakLine:true}}; }); if(arr.length>6) lines.push({text:"และอีก "+(arr.length-6)+" รายการ", options:{color:MUT}});
        if(!lines.length) lines=[{text:"ไม่มี", options:{color:MUT}}]; else lines[lines.length-1].options.breakLine=false;
        T(s, lines, {x:x, y:y+0.4, w:w, h:2.2, fontSize:11, paraSpaceAfter:3}); }
      var liT=function(o){ return o.r.id+"  "+o.a.L+"×"+o.a.I+" → "+o.b.L+"×"+o.b.I; };
      lst("ระดับสูงขึ้น", G.up.map(liT), 0.6, 1.6, 5.9); lst("ระดับลดลง", G.dn.map(liT), 6.8, 1.6, 5.9);
      lst("เพิ่มใหม่ / ปิด", G.nw.map(function(o){ return "เพิ่ม "+o.r.id; }).concat(G.cl.map(function(c){ return "ปิด "+c.rid; })), 0.6, 4.3, 5.9);
      lst("ปรับเกณฑ์และมติ", G.thr.map(function(c){ return c.rid+"  "+revTxt(c); }), 6.8, 4.3, 5.9);
      /* 5..n · หนึ่งสไลด์ต่อความเสี่ยงที่เสนอ */
      A.g.forEach(function(Gr, gi){ var x=Gr.x, sl=frame(x.r.id+"  "+x.r.title, null, true), p=riskAt(x.r, monthsBack(q.end,3));
        var boxes=[["Baseline", x.base]].concat(p.exists?[[prevQLabel(q), p]]:[]).concat([[q.label+" (ปัจจุบัน)", x.s, true]]).concat(x.tgt?[["Target", x.tgt]]:[]);
        boxes.forEach(function(b, i){ lvBox(sl, 0.6+i*2.55, 1.35, 2.35, 0.85, b[0], b[1], b[2]); });
        if(x.v) T(sl, x.v.t, {x:0.6+boxes.length*2.55, y:1.35, w:12.7-(0.6+boxes.length*2.55), h:0.85, fontSize:13, bold:true, color:{good:"0F5B32",blue:"233A95",high:"8A4A05",crit:"8A1C14"}[x.v.cls]||INK, valign:"middle"});
        var rows=[[{text:"KRI", options:{bold:true, color:MUT}},{text:prevQLabel(q)+" → "+q.label, options:{bold:true, color:MUT}},{text:"สถานะ", options:{bold:true, color:MUT}}]];
        rvKriItems([x], q).forEach(function(it){ var st=ST[it.b.st]||ST.pending;
          rows.push([{text:it.k.name}, {text:(it.a.v===null?"—":hFmt(it.a.v,it.a.u))+" → "+(it.b.v===null?"—":hFmt(it.b.v,it.b.u))}, {text:st[0], options:{color:st[1], fill:{color:st[2]}, bold:true}}]); });
        T(sl, "ตัวชี้วัดความเสี่ยง", {x:0.6, y:2.5, w:5.9, h:0.35, fontSize:13, bold:true, color:NAVY});
        sl.addTable(rows, {x:0.6, y:2.9, w:5.9, colW:[2.9,1.65,1.35], fontFace:F, fontSize:10.5, color:INK, border:{type:"solid", pt:0.5, color:LINE}, margin:0.05, valign:"middle", autoPage:false});
        var n=0, dn=0, late=0; x.r.factors.forEach(function(f){ (f.acts||[]).forEach(function(a){ n++; if(actDoneBy(a, q.end)) dn++; else if(a.due<ASOF) late++; }); });
        T(sl, "แนวทางจัดการ: เสร็จ "+dn+" จาก "+n+(late?" · เลยกำหนด "+late:""), {x:0.6, y:6.45, w:5.9, h:0.35, fontSize:11, color:MUT});
        T(sl, "ประเด็นเสนอ RMC", {x:6.9, y:2.5, w:5.8, h:0.35, fontSize:13, bold:true, color:NAVY});
        var parts=[]; Gr.items.forEach(function(it, ii){ var L=rvItemLine(q, it);
          parts.push({text:L.what, options:{bold:true, breakLine:true}});
          if(L.own) parts.push({text:"Risk Owner: "+L.own, options:{color:MUT, breakLine:true}});
          parts.push({text:"Risk ส่วนกลาง: "+(L.cm||"—"), options:{color:"233A95", breakLine: ii<Gr.items.length-1}});
          if(ii<Gr.items.length-1) parts.push({text:" ", options:{breakLine:true, fontSize:6}}); });
        sl.addShape(P.ShapeType.roundRect, {x:6.9, y:2.9, w:5.8, h:3.9, rectRadius:0.06, fill:{color:SOFT}, line:{color:SOFT}});
        T(sl, parts, {x:7.1, y:3.05, w:5.4, h:3.6, fontSize: Gr.items.length>2 ? 10 : 11.5, paraSpaceAfter:2}); });
      /* สรุปเรื่องที่ขอให้ RMC พิจารณา */
      s=frame("เรื่องที่ขอให้ RMC พิจารณา", A.n+" รายการจาก "+A.g.length+" ความเสี่ยง");
      var lines=[]; A.g.forEach(function(Gr, gi){ lines.push({text:(gi+1)+". "+Gr.x.r.id+"  "+Gr.x.r.title, options:{bold:true, breakLine:true, color:NAVY}});
        Gr.items.forEach(function(it){ var L=rvItemLine(q, it); lines.push({text:L.cm||L.what, options:{bullet:{indent:14}, breakLine:true}}); }); });
      if(lines.length) lines[lines.length-1].options.breakLine=false;
      T(s, lines, {x:0.6, y:1.55, w:12.1, h:5.3, fontSize: lines.length>14 ? 10 : 12, paraSpaceAfter:4});
      return P.write({outputType:"blob"}).then(function(blob){ return saveFile("PRECISE_RMC_"+q.label.replace("/","-")+".pptx", blob); });
    }).catch(function(){ toast("สร้างสไลด์ไม่สำเร็จ ลองใหม่อีกครั้ง"); });
  }
  function rvRerender(){ var y=window.scrollY; rerenderFilterable(); window.scrollTo(0, y); }
  function rvGoStep(n){ rvStep=n; rvCloseAsk=false; rerenderFilterable(); var st=document.querySelector(".rv-steps"); if(st && st.getBoundingClientRect().top<0) st.scrollIntoView({block:"start"}); var b=document.querySelector('.rv-st[data-rv-step="'+n+'"]'); if(b) b.focus(); }
  document.addEventListener("click", function(e){ if(CUR!=="review" || !e.target.closest) return;
    var t;
    if((t=e.target.closest("[data-rv-step]"))){ rvGoStep(+t.getAttribute("data-rv-step")); return; }
    if(e.target.closest("[data-rv-cur]")){ rvQ=QCUR.id; rvRerender(); return; }
    if((t=e.target.closest("[data-rv-f1]"))){ rvF1=t.getAttribute("data-rv-f1"); rvRerender(); return; }
    if((t=e.target.closest("[data-rv-f3]"))){ rvF3=t.getAttribute("data-rv-f3"); rvRerender(); return; }
    if((t=e.target.closest("[data-rv-quad]"))){ rvF3=t.getAttribute("data-rv-quad"); rvGoStep(3); return; }
    if((t=e.target.closest("[data-rv-remind]"))){ var rr=riskById(t.getAttribute("data-rv-remind")), f=flowOf(rr); toast("ส่งแจ้งเตือนให้ "+(f.state==="submitted" ? coordName(rr) : (rr.owner||"Risk Owner"))+" แล้ว"); return; }
    if((t=e.target.closest("[data-rv-rmc]"))){ var q=qById(rvQ), key=t.getAttribute("data-rv-rmc"), c=rvGet(q.id, key), on=!(c&&c.rmc); rvSet(q.id, key, {rmc:on});
      logAudit(key.split("|")[1], "risk", (on?"เลือกเสนอ RMC":"ยกเลิกเสนอ RMC")+" · "+q.label, [{t:key.split("|").slice(2).join("|")}]);
      rvRerender(); var nb=document.querySelector('[data-rv-rmc="'+key.replace(/"/g,'\\"')+'"]'); if(nb) nb.focus(); return; }
    if(e.target.closest("[data-rv-slides]")){ rvSlides(); return; }
    if((t=e.target.closest("[data-rv-res]"))){ var pr=t.getAttribute("data-rv-res").split("|"), q5=qById(rvQ), mk="m|"+pr[0], cur=rvGet(q5.id, mk)||{}, nv=cur.res===pr[1]?"":pr[1];
      rvSet(q5.id, mk, {res:nv}); logAudit(pr[0], "risk", "บันทึกมติ RMC · "+q5.label, [{t:"มติ", a:cur.res||"—", b:nv||"—"}]); rvRerender(); return; }
    if((t=e.target.closest("[data-rv-close]"))){ var v=t.getAttribute("data-rv-close"), qq=qById(rvQ);
      if(v==="ask"){ rvCloseAsk=true; rvRerender(); return; }
      if(v==="no"){ rvCloseAsk=false; rvRerender(); return; }
      var all=sessGet("prc-qclose", {}); all[qq.id]={by:currentUser.name, d:ASOF}; sessSet("prc-qclose", all); rvCloseAsk=false; rvRerender(); toast("ปิดรอบ "+qq.label+" แล้ว"); return; }
  });
  document.addEventListener("change", function(e){ if(CUR!=="review") return;
    if(e.target.id==="rvQ"){ rvQ=e.target.value; rvCloseAsk=false; rvRerender(); return; }
    var mt=e.target.getAttribute && e.target.getAttribute("data-rv-mt");
    if(mt){ var qm=qById(rvQ), om=rvSet(qm.id, "m|"+mt, {t:e.target.value}); logAudit(mt, "risk", "รายละเอียดมติ RMC · "+qm.label, [{t:"มติ", a:om&&om.t?om.t:"—", b:e.target.value||"—"}]); return; }
    var key=e.target.getAttribute && e.target.getAttribute("data-rv-cm"); if(!key) return;
    var q=qById(rvQ), old=rvSet(q.id, key, {t:e.target.value});
    logAudit(key.split("|")[1], "risk", "ความเห็น Risk ส่วนกลาง · "+q.label, [{t:key.split("|").slice(2).join("|"), a:old&&old.t?old.t:"—", b:e.target.value||"—"}]);
    var infos=rvInfos(q), needs=rvKriItems(infos, q).filter(rvNeeds).concat(rvActItems(infos, q).filter(rvNeeds)), nD=needs.filter(function(it){ var c=rvGet(q.id, it.key); return c && String(c.t).trim(); }).length;
    var pg=document.querySelector(".rv-body .qr-prog b"); if(pg) pg.textContent=nD;
    var s3=document.querySelector('.rv-st[data-rv-step="3"] .rv-sx > span'); if(s3) s3.textContent='ความเห็น '+nD+'/'+needs.length+' รายการที่ต้องดู';
  });

  /* ---------------- YEAR-END REVIEW (ทบทวนสิ้นปี → Risk Profile ปีถัดไป) ---------------- */
  var YE = PRC.YEAR_END || null, PREV = PRC.PREV_YEAR || {risks:[]};
  var YE_CATS = [["SR","Strategic"],["FR","Financial"],["OR","Operational"],["ER","ESG"],["CR","Compliance"]];
  function yeStore(){ var s=sessGet("prc-yearend", null); if(s) return s; return {dec:JSON.parse(JSON.stringify((YE&&YE.seed)||{})), adds:JSON.parse(JSON.stringify((YE&&YE.adds)||[]))}; }
  function yeSave(s){ sessSet("prc-yearend", s); }
  function yeNewId(r){ return r.id.replace(/-\d{2}-(\d{2})$/, "-"+YE.to.slice(2)+"-$1"); }
  function yeParts(id){ var m=/^([A-Z]+)-([A-Z]{2})-\d{2}-(\d{2})$/.exec(id); return m ? {co:m[1], cat:m[2], n:+m[3]} : null; }
  function yeAddIds(s){ var used={}; RISKS.forEach(function(r){ var p=yeParts(r.id); if(p){ var k=p.co+"-"+p.cat; used[k]=Math.max(used[k]||0, p.n); } });
    return s.adds.map(function(a){ var k=a.sub+"-"+a.cat; used[k]=(used[k]||0)+1; return a.sub+"-"+a.cat+"-"+YE.to.slice(2)+"-"+("0"+used[k]).slice(-2); }); }
  function yePrevOf(rid){ return PREV.risks.filter(function(p){ return (p.to||[]).indexOf(rid)!==-1; }); }
  function yeEditable(){ return !!currentUser && can(CAN_REVIEW) && !yeS().opened; }
  function yeList(){ return filteredRisks().filter(function(r){ return riskAt(r, QCUR.end).exists; }); }
  function yeCounts(list, s){ var c={carry:0, merge:0, close:0, none:0}; list.forEach(function(r){ var d=s.dec[r.id]; c[d&&d.d?d.d:"none"]++; }); return c; }
  var YE_D = [["carry","ยกไป "+(YE?YE.to:"")],["merge","รวม"],["close","ปิด"]];
  function renderYearEnd(){
    if(!YE) return emptyState('ยังไม่เปิดรอบทบทวนสิ้นปี');
    var s=yeStore(), list=yeList(), edit=yeEditable(), c=yeCounts(list, s), addIds=yeAddIds(s);
    var carried=list.filter(function(r){ var d=s.dec[r.id]; return d && d.d==="carry"; });
    var sum='<div class="ye-sum"><span>ยกไป '+YE.to+' <b class="mono">'+c.carry+'</b></span><span>รวมกับเรื่องอื่น <b class="mono">'+c.merge+'</b></span><span>ปิด <b class="mono">'+c.close+'</b></span><span>ความเสี่ยงใหม่ <b class="mono">'+s.adds.length+'</b></span>'+
      '<span class="'+(c.none?'ye-left':'')+'">ยังไม่ตัดสินใจ <b class="mono">'+c.none+'</b></span></div>';
    var rows=list.map(function(r){ var d=s.dec[r.id]||{}, x=riskQInfo(r, QCUR), prev=yePrevOf(r.id);
      var seg = edit ? '<div class="ye-seg" role="group" aria-label="การตัดสินใจ '+r.id+'">'+YE_D.map(function(o){ var on=d.d===o[0]; return '<button type="button" class="'+(on?'on '+o[0]:'')+'" aria-pressed="'+on+'" data-ye-d="'+r.id+'|'+o[0]+'">'+o[1]+'</button>'; }).join('')+'</div>'
        : (d.d ? '<span class="ye-dro '+d.d+'">'+YE_D.filter(function(o){ return o[0]===d.d; })[0][1]+'</span>' : '<span class="qr-none">—</span>');
      var det='';
      if(d.d==="carry"){ var t=d.title!=null?d.title:r.title, renamed=t.trim()!==r.title.trim();
        det='<div class="ye-new"><span class="mono ye-nid">'+yeNewId(r)+'</span>'+(renamed?'<span class="ye-ren">เปลี่ยนชื่อ</span>':'')+'</div>'+
          (edit ? '<textarea class="qr-cm" rows="'+Math.max(2, Math.ceil(t.length/58))+'" data-ye-title="'+r.id+'" aria-label="ชื่อความเสี่ยงปี '+YE.to+'">'+esc(t)+'</textarea>' : '<div class="qr-cmro">'+esc(t)+'</div>'); }
      else if(d.d==="merge"){ var opts=carried.filter(function(o){ return o!==r; });
        det = edit ? '<label class="ye-f"><span>รวมเข้ากับ</span><select class="rf-sel" data-ye-into="'+r.id+'"><option value="">เลือกความเสี่ยงที่ยกไป '+YE.to+'</option>'+opts.map(function(o){ return '<option value="'+o.id+'"'+(d.into===o.id?' selected':'')+'>'+yeNewId(o)+' · '+esc((s.dec[o.id].title||o.title).slice(0,60))+'</option>'; }).join('')+'</select></label>'
          : '<div class="qr-cmro">รวมเข้ากับ <span class="mono">'+(d.into?yeNewId(riskById(d.into)):'—')+'</span></div>';
        if(d.into && !carried.some(function(o){ return o.id===d.into; })) det+='<div class="ye-warn">เรื่องที่เลือกไม่ได้ยกไป '+YE.to+' แล้ว เลือกใหม่</div>'; }
      else if(d.d==="close"){ det = edit ? '<textarea class="qr-cm" rows="1" data-ye-note="'+r.id+'" aria-label="เหตุผลที่ปิด '+r.id+'" placeholder="เหตุผลที่ปิด">'+esc(d.note||"")+'</textarea>' : '<div class="qr-cmro">'+esc(d.note||"—")+'</div>'; }
      return '<tr><td class="ye-old"><button type="button" class="qr-rid mono" data-risk="'+r.id+'">'+r.id+'</button><div class="ye-t">'+esc(r.title)+'</div>'+
          (prev.length?'<div class="ye-from">สืบเนื่องจาก '+PREV.year+': '+prev.map(function(p){ return '<span class="mono">'+p.id+'</span>'; }).join(', ')+'</div>':'')+'</td>'+
        '<td class="ye-lv">'+lvPillLI(x.s)+'<div>'+rvLevelTiny(x)+'</div></td><td>'+seg+'</td><td class="ye-det">'+det+'</td></tr>'; }).join('');
    var subOpts=function(v){ return SUBS.map(function(x){ return '<option value="'+x.id+'"'+(v===x.id?' selected':'')+'>'+x.id+'</option>'; }).join(''); };
    var catOpts=function(v){ return YE_CATS.map(function(x){ return '<option value="'+x[0]+'"'+(v===x[0]?' selected':'')+'>'+x[1]+'</option>'; }).join(''); };
    var fromOpts=function(v){ return '<option value="">ไม่มี (เรื่องใหม่)</option>'+list.map(function(r){ return '<option value="'+r.id+'"'+(v===r.id?' selected':'')+'>'+r.id+'</option>'; }).join(''); };
    var adds=s.adds.map(function(a, i){
      return '<div class="ye-add">'+(edit ?
        '<span class="mono ye-nid">'+addIds[i]+'</span><select class="rf-sel" data-ye-new="'+i+':sub" aria-label="บริษัท">'+subOpts(a.sub)+'</select><select class="rf-sel" data-ye-new="'+i+':cat" aria-label="ประเภท">'+catOpts(a.cat)+'</select>'+
        '<textarea class="qr-cm" rows="1" data-ye-new="'+i+':title" aria-label="ชื่อความเสี่ยงใหม่" placeholder="ชื่อความเสี่ยง (เขียนเป็นเหตุการณ์ในอนาคต)">'+esc(a.title||"")+'</textarea>'+
        '<label class="ye-f"><span>สืบเนื่องจาก</span><select class="rf-sel" data-ye-new="'+i+':from">'+fromOpts(a.from)+'</select></label><button type="button" class="ye-del" data-ye-del="'+i+'" aria-label="ลบ">&times;</button>'
        : '<span class="mono ye-nid">'+addIds[i]+'</span><span>'+esc(a.title||"")+'</span>'+(a.from?'<span class="ye-from">สืบเนื่องจาก <span class="mono">'+a.from+'</span></span>':''))+'</div>'; }).join('');
    return sum+'<div class="qr-tw"><table class="qr-t ye-t"><thead><tr><th>ความเสี่ยงปี '+YE.from+'</th><th>ระดับ '+QCUR.label+'</th><th>การตัดสินใจ</th><th>ปี '+YE.to+'</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }
  function dlgProfile(){ var s=yeStore(), list=yeList(), addIds=yeAddIds(s);
    var carried=list.filter(function(r){ var d=s.dec[r.id]; return d && d.d==="carry"; });
    var items=carried.map(function(r){ var d=s.dec[r.id], t=d.title!=null?d.title:r.title, from=[r.id].concat(list.filter(function(o){ var e=s.dec[o.id]; return e && e.d==="merge" && e.into===r.id; }).map(function(o){ return o.id; }));
      return {id:yeNewId(r), t:t, from:from, ren:t.trim()!==r.title.trim()}; });
    s.adds.forEach(function(a, i){ items.push({id:addIds[i], t:a.title||"", from:a.from?[a.from]:[], add:true}); });
    items.sort(function(a,b){ return a.id<b.id?-1:1; });
    var closed=list.filter(function(r){ var d=s.dec[r.id]; return d && d.d==="close"; }), none=list.filter(function(r){ var d=s.dec[r.id]; return !d || !d.d; });
    var body=(none.length?'<div class="dl-alert watch">'+icon("flag")+'<div><b>ยังไม่ตัดสินใจ '+none.length+' เรื่อง</b>'+none.map(function(r){ return r.id; }).join(', ')+'</div></div>':'')+
      '<h4 class="ye-dh">ความเสี่ยงปี '+YE.to+' <span class="rf-n">'+items.length+'</span></h4><ol class="ye-pl">'+items.map(function(it){ return '<li><span class="mono ye-nid">'+it.id+'</span><div><div>'+esc(it.t)+'</div><div class="ye-from">'+
        (it.from.length ? 'สืบเนื่องจาก '+it.from.map(function(f){ return '<span class="mono">'+f+'</span>'; }).join(' + ')+(it.ren?' · เปลี่ยนชื่อ':'')+(it.from.length>1?' · รวม '+it.from.length+' เรื่อง':'') : 'เรื่องใหม่')+'</div></div></li>'; }).join('')+'</ol>'+
      (closed.length?'<h4 class="ye-dh">ปิดสิ้นปี '+YE.from+' <span class="rf-n">'+closed.length+'</span></h4><ol class="ye-pl">'+closed.map(function(r){ return '<li><span class="mono ye-nid">'+r.id+'</span><div><div>'+esc(r.title)+'</div><div class="ye-from">'+esc(s.dec[r.id].note||"")+'</div></div></li>'; }).join('')+'</ol>':'');
    return dlgShell({title:"Risk Profile "+YE.to, sub:'จากการทบทวนสิ้นปี '+YE.from+' · เสนอ '+esc(YE.rmc), cls:"wide", body:body,
      hint:'Baseline และ Target ปี '+YE.to+' กำหนดเมื่อ RMC เห็นชอบ', foot:'<button type="button" class="ra-btn" data-ae-cancel="1">ปิด</button>'}); }
  /* สืบเนื่องจากปีก่อน (แท็บประวัติ) */
  function yeLineageHtml(r){ var prev=yePrevOf(r.id); if(!prev.length) return '';
    return '<div class="ye-lin"><h4>สืบเนื่องจากปี '+PREV.year+'</h4>'+prev.map(function(p){ return '<div class="ye-lr"><span class="mono ye-nid">'+p.id+'</span><div><div>'+esc(p.title)+'</div><div class="ye-from">'+(p.q4?'ระดับ Q4/'+PREV.year.slice(2)+' '+p.q4[0]+'×'+p.q4[1]+' · ':'')+esc(p.note||"")+'</div></div></div>'; }).join('')+'</div>'; }
  document.addEventListener("click", function(e){ if(CUR!=="yearly" || !e.target.closest) return; var t, s;
    if((t=e.target.closest("[data-ye-d]"))){ var p=t.getAttribute("data-ye-d").split("|"); s=yeStore(); var cur=s.dec[p[0]]||{}; s.dec[p[0]]={d: cur.d===p[1] ? "" : p[1], title:cur.title, into:cur.into, note:cur.note}; yeSave(s);
      logAudit(p[0], "risk", "ทบทวนสิ้นปี "+YE.from+": "+(s.dec[p[0]].d ? YE_D.filter(function(o){ return o[0]===p[1]; })[0][1] : "ยกเลิกการตัดสินใจ"), []); rvRerender(); return; }
    if(e.target.closest("[data-ye-add]")){ s=yeStore(); s.adds.push({sub:"PCC", cat:"SR", title:"", from:""}); yeSave(s); rvRerender(); var ts=document.querySelectorAll('[data-ye-new$=":title"]'); if(ts.length) ts[ts.length-1].focus(); return; }
    if((t=e.target.closest("[data-ye-del]"))){ s=yeStore(); s.adds.splice(+t.getAttribute("data-ye-del"),1); yeSave(s); rvRerender(); return; }
    if(e.target.closest("[data-ye-profile]")){ openDlg({kind:"profile"}, e.target.closest("[data-ye-profile]")); return; }
  });
  document.addEventListener("change", function(e){ if(CUR!=="yearly" || !e.target.getAttribute) return; var s, a;
    if((a=e.target.getAttribute("data-ye-title"))){ s=yeStore(); s.dec[a].title=e.target.value; yeSave(s); logAudit(a, "risk", "ชื่อความเสี่ยงปี "+YE.to, [{t:yeNewId(riskById(a)), b:e.target.value}]); rvRerender(); return; }
    if((a=e.target.getAttribute("data-ye-into"))){ s=yeStore(); s.dec[a].into=e.target.value; yeSave(s); rvRerender(); return; }
    if((a=e.target.getAttribute("data-ye-note"))){ s=yeStore(); s.dec[a].note=e.target.value; yeSave(s); return; }
    if((a=e.target.getAttribute("data-ye-new"))){ var p=a.split(":"); s=yeStore(); s.adds[+p[0]][p[1]]=e.target.value; yeSave(s); if(p[1]!=="title") rvRerender(); return; }
  });

  /* ---------------- มติ RMC: ปรับ L×I / Baseline / Target / Appetite / Tolerance → Revision + Audit Trail ---------------- */
  var RD_T = [["LI","ระดับ L×I"],["base","Baseline"],["target","Target"],["app","Appetite"],["tol","Tolerance"]];
  function rdMtgDefault(){ return QCUR ? String(QCUR.rmc||"").split(" · ")[0] : ""; }
  function rdApply(c){ var r=riskById(c.rid); if(!r) return;
    if(c.t==="LI"){ r.L=c.b[0]; r.I=c.b[1]; r.level=LV_NAME[levelForLICorrect(r.L, r.I)]; }
    else if(c.t==="base" || c.t==="target"){ RL[r.id]=RL[r.id]||{base:null, target:null}; var o=RL[r.id][c.t];
      RL[r.id][c.t] = o ? {L:c.b[0], I:c.b[1], mtg:o.mtg, d:o.d, by:o.by} : (c.t==="base" ? {L:c.b[0], I:c.b[1], mtg:c.mtg, d:ASOF} : {L:c.b[0], I:c.b[1], by:ASOF.slice(0,4)+"-12"});
      if(c.t==="base") delete BASE_PENDING[r.id]; }
    else { var k=r.kris.filter(function(x){ return x.name===c.k; })[0]; if(!k) return; k[c.t==="app"?"appetite":"tolerance"]=c.b;
      var md=kriMd(r,k), v=hNum(k.current); if(v!==null && md.app!==null) k.status=hStatus(md, v); }
    REV.push(c); REV.sort(function(a,b){ return b.p.localeCompare(a.p); }); }
  function applyRmcDecs(){ sessGet("prc-rmc-dec", []).forEach(rdApply); }
  function rdDefaults(d){ var r=riskById(d.rid); if(!r) return d;
    if(d.t==="LI"){ d.L=r.L; d.I=r.I; }
    else if(d.t==="base" || d.t==="target"){ var o=(RL[r.id]||{})[d.t]; d.L=o?o.L:r.L; d.I=o?o.I:r.I; }
    else { d.ki=0; var k=r.kris[0]; d.val=k ? (d.t==="app"?k.appetite:k.tolerance)||"" : ""; }
    return d; }
  function openRmcDec(opener){ var list=filteredRisks(); if(!list.length) return;
    openDlg(rdDefaults({kind:"rmcdec", rid:list[0].id, t:"LI", mtg:rdMtgDefault(), note:"", err:""}), opener); }
  function rdOld(d, r){ if(d.t==="LI") return [r.L, r.I]; if(d.t==="base"||d.t==="target"){ var o=(RL[r.id]||{})[d.t]; return o?[o.L,o.I]:null; }
    var k=r.kris[d.ki]; return k ? (d.t==="app"?k.appetite:k.tolerance)||"" : ""; }
  function dlgRmcDec(){ var d=dlg, r=riskById(d.rid), list=filteredRisks(), old=rdOld(d, r);
    var num=function(id, v){ return '<select class="rf-sel" id="'+id+'">'+[1,2,3,4].map(function(n){ return '<option'+(n===v?' selected':'')+'>'+n+'</option>'; }).join('')+'</select>'; };
    var isLv = d.t==="LI"||d.t==="base"||d.t==="target";
    var field = isLv
      ? '<div class="rd-row"><label class="ae-f1"><span>L (โอกาส)</span>'+num("rdL", +d.L)+'</label><label class="ae-f1"><span>I (ผลกระทบ)</span>'+num("rdI", +d.I)+'</label>'+
          '<div class="ae-f1"><span>ระดับ</span><div class="rd-lv">'+levelPill(LV_NAME[levelForLICorrect(+d.L,+d.I)])+'</div></div>'+
          '<div class="ae-f1"><span>ค่าเดิม</span><div class="rd-old mono">'+(old?old[0]+'×'+old[1]:'ยังไม่มี')+'</div></div></div>'
      : (r.kris.length ? '<div class="rd-row"><label class="ae-f1 rd-grow"><span>KRI</span><select class="rf-sel" id="rdK">'+r.kris.map(function(k, i){ return '<option value="'+i+'"'+(i===+d.ki?' selected':'')+'>'+esc(k.name)+'</option>'; }).join('')+'</select></label>'+
          '<label class="ae-f1"><span>ค่าใหม่</span><input class="ae-in mono" id="rdVal" value="'+escAttr(d.val||"")+'" placeholder="เช่น ≤10%"></label>'+
          '<div class="ae-f1"><span>ค่าเดิม</span><div class="rd-old mono">'+esc(old||"—")+'</div></div></div>' : '<div class="ov-none">ความเสี่ยงนี้ไม่มี KRI</div>');
    var body='<label class="ae-f1"><span>ความเสี่ยง</span><select class="rf-sel" id="rdRisk">'+list.map(function(x){ return '<option value="'+x.id+'"'+(x.id===d.rid?' selected':'')+'>'+x.id+' · '+esc(x.title.slice(0,70))+'</option>'; }).join('')+'</select></label>'+
      '<div class="ae-f1"><span>เรื่องที่ปรับ</span><div class="ae-seg rd-seg" role="group" aria-label="เรื่องที่ปรับ">'+RD_T.map(function(o){ var on=d.t===o[0]; return '<button type="button" class="'+(on?'on':'')+'" aria-pressed="'+on+'" data-rd-t="'+o[0]+'">'+o[1]+'</button>'; }).join('')+'</div></div>'+
      field+
      '<div class="rd-row"><label class="ae-f1"><span>ครั้งประชุม</span><input class="ae-in" id="rdMtg" value="'+escAttr(d.mtg||"")+'"></label>'+
      '<label class="ae-f1 rd-grow"><span>มติ / เหตุผล <b class="ae-late">จำเป็น</b></span><textarea class="ae-in" rows="2" id="rdNote">'+esc(d.note||"")+'</textarea></label></div>'+
      (d.err?'<div class="dl-err" role="alert">'+esc(d.err)+'</div>':'');
    return dlgShell({title:"บันทึกมติ RMC", sub:'ลง Revision และ Audit Trail อัตโนมัติ · มีผลกับรอบ '+roundLabel(ASOF.slice(0,7)), cls:"wide", body:body,
      foot:'<button type="button" class="ra-btn" data-ae-cancel="1">ยกเลิก</button><button type="button" class="ra-btn primary" data-rd-save="1">'+icon("check")+'บันทึกมติ</button>'}); }
  function saveRmcDec(){ var d=dlg, r=riskById(d.rid), old=rdOld(d, r), isLv=d.t==="LI"||d.t==="base"||d.t==="target", b=isLv?[+d.L,+d.I]:String(d.val||"").trim();
    if(isLv ? (old && old[0]===b[0] && old[1]===b[1]) : (!b || b===old)){ d.err="ค่าใหม่ต้องต่างจากค่าเดิม"; keepScroll(renderDlg); return; }
    if(!String(d.note).trim()){ d.err="ใส่มติหรือเหตุผล"; keepScroll(renderDlg); var n=document.getElementById("rdNote"); if(n) n.focus(); return; }
    var c={p:ASOF.slice(0,7), rid:r.id, t:d.t, a:old||(isLv?[0,0]:""), b:b, by:currentUser.name, note:(d.mtg?d.mtg+" · ":"")+String(d.note).trim(), mtg:d.mtg};
    if(!isLv) c.k=r.kris[d.ki].name;
    if(isLv && !old) c.a=b.slice();
    var all=sessGet("prc-rmc-dec", []); all.push(c); sessSet("prc-rmc-dec", all); rdApply(c);
    logAudit(r.id, "risk", "บันทึกมติ RMC · "+RD_T.filter(function(o){ return o[0]===d.t; })[0][1]+(c.k?" ("+c.k+")":""), [{t:d.mtg||"มติ", a:isLv?(old?old.join("×"):"—"):(old||"—"), b:isLv?b.join("×"):b}, {t:"เหตุผล", b:String(d.note).trim()}]);
    closeDlg(); rerenderFilterable(); toast("บันทึกมติของ "+r.id+" แล้ว"); }
  document.addEventListener("click", function(e){ if(!e.target.closest) return; var t;
    if(e.target.closest("[data-rd-open]")){ openRmcDec(e.target.closest("[data-rd-open]")); return; }
    if(!dlg || dlg.kind!=="rmcdec") return;
    if((t=e.target.closest("[data-rd-t]"))){ dlg.t=t.getAttribute("data-rd-t"); dlg.err=""; rdDefaults(dlg); keepScroll(renderDlg); return; }
    if(e.target.closest("[data-rd-save]")){ saveRmcDec(); return; }
  });
  document.addEventListener("change", function(e){ if(!dlg || dlg.kind!=="rmcdec") return; var id=e.target.id;
    if(id==="rdRisk"){ dlg.rid=e.target.value; dlg.err=""; rdDefaults(dlg); keepScroll(renderDlg); }
    else if(id==="rdL" || id==="rdI"){ dlg[id==="rdL"?"L":"I"]=+e.target.value; keepScroll(renderDlg); }
    else if(id==="rdK"){ dlg.ki=+e.target.value; var k=riskById(dlg.rid).kris[dlg.ki]; dlg.val=(dlg.t==="app"?k.appetite:k.tolerance)||""; keepScroll(renderDlg); }
  });
  document.addEventListener("input", function(e){ if(!dlg || dlg.kind!=="rmcdec") return; var id=e.target.id;
    if(id==="rdVal") dlg.val=e.target.value; else if(id==="rdMtg") dlg.mtg=e.target.value; else if(id==="rdNote") dlg.note=e.target.value; });
  /* จาก Home ไปแท็บ "อะไรเปลี่ยน" ของ Quarterly Review */
  document.addEventListener("click", function(e){ var t=e.target.closest && e.target.closest("[data-rv-goto]"); if(!t) return; rvStep=2; rvQ=QCUR?QCUR.id:rvQ; goToPage("review"); });

  /* ---------------- YEARLY REVIEW · ทบทวนประจำปี → Risk Profile ปีถัดไป ----------------
     1 ทบทวนความเสี่ยงเดิม → 2 ระบุความเสี่ยงใหม่ตาม Objective → 3 Baseline และ Target → 4 เสนอ RMC → 5 เปิดปีใหม่ */
  var yrStep = 1, yrAsk = false;
  var T4 = ["Treat","Tolerate","Transfer","Terminate"], YR_RES = ["เห็นชอบ","เห็นชอบโดยมีเงื่อนไข","ให้แก้ไขแล้วเสนอใหม่"];
  function yeS(){ var s=yeStore(); s.prof=s.prof||{}; s.rmc=s.rmc||{}; return s; }
  function yrItems(s){ var list=yeList(), aid=yeAddIds(s), out=[];
    list.forEach(function(r){ var d=s.dec[r.id]; if(!d || d.d!=="carry") return;
      var from=[r.id].concat(list.filter(function(o){ var e=s.dec[o.id]; return e && e.d==="merge" && e.into===r.id; }).map(function(o){ return o.id; }));
      var t=d.title!=null?d.title:r.title, tg=(RL[r.id]||{}).target;
      out.push({id:yeNewId(r), r:r, t:t, from:from, ren:t.trim()!==r.title.trim(), objs:r.objs||[], cur:{L:r.L, I:r.I},
        def:{bL:r.L, bI:r.I, tL:tg?tg.L:"", tI:tg?tg.I:"", t4:String(r.response||"Treat").split(" ")[0]}}); });
    s.adds.forEach(function(a, i){ out.push({id:aid[i], add:i, t:a.title||"", from:a.from?[a.from]:[], objs:a.obj?[a.obj]:[], cur:null, def:{bL:"", bI:"", tL:"", tI:"", t4:"Treat"}}); });
    out.sort(function(a,b){ return a.id<b.id?-1:1; });
    out.forEach(function(it){ var p=s.prof[it.id]||{}; it.p={}; ["bL","bI","tL","tI","t4"].forEach(function(k){ it.p[k]= p[k]!=null ? p[k] : it.def[k]; });
      it.done = !!(it.p.bL && it.p.bI && it.p.tL && it.p.tI && String(it.t).trim()); });
    return out; }
  function yrObjs(){ var out=[]; registerDomains().forEach(function(d){ d.objs.forEach(function(o){ out.push({code:o.code, title:o.title, p:d.p}); }); }); return out; }
  function renderYearly(){
    if(!YE || !QCUR) return emptyState('ยังไม่เปิดรอบทบทวนประจำปี');
    var s=yeS(), list=yeList(), edit=yeEditable(), c=yeCounts(list, s), items=yrItems(s), objs=yrObjs();
    var uncovered=objs.filter(function(o){ return !items.some(function(it){ return it.objs.indexOf(o.code)!==-1; }); }).length;
    var nSet=items.filter(function(it){ return it.done; }).length;
    var S=[
      {n:1, t:"ทบทวนความเสี่ยงเดิม", s: c.none ? "warn" : "done", d:'ตัดสินใจแล้ว '+(list.length-c.none)+'/'+list.length+' เรื่อง'},
      {n:2, t:"ระบุความเสี่ยงใหม่", s: uncovered ? "warn" : "done", d: s.adds.length+' เรื่องใหม่ · Objective ที่ยังไม่มีความเสี่ยง '+uncovered},
      {n:3, t:"Baseline และ Target", s: items.length && nSet===items.length ? "done" : "todo", d:'กำหนดแล้ว '+nSet+'/'+items.length+' เรื่อง'},
      {n:4, t:"เสนอ RMC", s: s.rmc.res==="เห็นชอบ"||s.rmc.res==="เห็นชอบโดยมีเงื่อนไข" ? "done" : "todo", d: s.rmc.res ? 'มติ: '+s.rmc.res : esc(YE.rmc)},
      {n:5, t:"เปิดปี "+YE.to, s: s.opened ? "done" : "todo", d: s.opened ? 'เปิดแล้ว '+thDate(s.opened.d) : 'หลัง RMC เห็นชอบ'}];
    var steps='<nav class="rv-steps" aria-label="ขั้นตอนทบทวนประจำปี">'+S.map(function(x){ var on=yrStep===x.n;
      return '<button type="button" class="rv-st '+x.s+(on?' cur':'')+'" data-yr-step="'+x.n+'"'+(on?' aria-current="step"':'')+'><span class="rv-n" aria-hidden="true">'+(x.s==="done"&&!on?'✓':x.n)+'</span><span class="rv-sx"><b>'+x.t+'</b><span>'+x.d+'</span></span></button>'; }).join('')+'</nav>';
    var chip = s.opened ? '<span class="rv-qst closed">'+icon("lock")+'เปิดปี '+YE.to+' แล้ว</span>' : '<span class="rv-qst">กำลังทบทวน · ปี '+YE.from+' → '+YE.to+'</span>';
    var head='<div class="page-head"><div><h2>Yearly Review</h2><div class="sub">ทบทวนความเสี่ยงประจำปีเพื่อตั้ง Risk Profile '+YE.to+' เริ่มจาก Objective ปีใหม่ ไม่ใช่แค่ยกความเสี่ยงเดิมไปต่อ</div></div><div class="qr-ctl">'+chip+'</div></div>';
    var toolbar='<div class="rf tb">'+companyRow(function(id){ return scopeRisks().filter(function(r){ return (id==="ALL"||r.sub===id) && riskAt(r, QCUR.end).exists; }).length; })+'</div>';
    var ro = !edit ? '<div class="rv-ro">'+icon(s.opened?"lock":"eye")+'<div><b>'+(s.opened?'เปิดปี '+YE.to+' แล้ว · ดูได้อย่างเดียว':'ดูได้อย่างเดียว')+'</b>'+(s.opened?'การทบทวนประจำปีปิดแล้ว':'การทบทวนประจำปีทำโดย Risk ส่วนกลาง (สิทธิ์ Admin)')+'</div></div>' : '';
    var body = yrStep===2 ? yr2(s, items, objs, edit) : yrStep===3 ? yr3(s, items, edit) : yrStep===4 ? yr4(s, items, list, edit) : yrStep===5 ? yr5(s, items, list, c, edit) : yr1(s);
    return head+toolbar+steps+'<div class="card rv-body">'+ro+body+'</div>'+renderRiskModal();
  }
  function yrNext(n){ var t={2:"ระบุความเสี่ยงใหม่",3:"Baseline และ Target",4:"เสนอ RMC",5:"เปิดปี "+YE.to}[n]; return t ? '<div class="rv-next"><span></span><button type="button" class="ra-btn" data-yr-step="'+n+'">ขั้นที่ '+n+' · '+t+' →</button></div>' : ''; }
  function yr1(s){ return '<div class="rv-bar"><h3>ทบทวนความเสี่ยงเดิมปี '+YE.from+'</h3></div><p class="rv-help">แต่ละเรื่องเลือก ยกไปปี '+YE.to+' (แก้ชื่อได้ ระบบออกรหัสใหม่ให้) / รวมกับเรื่องอื่น / ปิด ถ้าต้องการแยกเรื่องเดิมเป็นหลายเรื่อง ให้เพิ่มความเสี่ยงใหม่ในขั้นที่ 2 แล้วเลือก "สืบเนื่องจาก"</p>'+renderYearEnd()+yrNext(2); }
  function yr2(s, items, objs, edit){
    var addIds=yeAddIds(s), list=yeList();
    var rows=objs.map(function(o){ var cov=items.filter(function(it){ return it.objs.indexOf(o.code)!==-1; });
      return '<div class="yr-o'+(cov.length?'':' gap')+'"><div class="yr-oh"><span class="obj2-c mono">'+o.code+'</span><span class="yr-ot">'+esc(o.title)+'</span>'+tierBadge(o.code)+
          (edit?'<button type="button" class="ae-add yr-add" data-ye-add-obj="'+o.code+'">+ เพิ่มความเสี่ยง</button>':'')+'</div>'+
        (cov.length ? '<ul class="yr-cov">'+cov.map(function(it){ return '<li><span class="mono ye-nid">'+it.id+'</span><span>'+esc(it.t||'(ยังไม่ตั้งชื่อ)')+'</span>'+(it.add!=null?'<span class="ye-ren">ใหม่</span>':'')+'</li>'; }).join('')+'</ul>'
          : '<div class="yr-gapmsg">ยังไม่มีความเสี่ยงปี '+YE.to+' รองรับ Objective นี้</div>')+'</div>'; }).join('');
    var subOpts=function(v){ return SUBS.map(function(x){ return '<option value="'+x.id+'"'+(v===x.id?' selected':'')+'>'+x.id+'</option>'; }).join(''); };
    var catOpts=function(v){ return YE_CATS.map(function(x){ return '<option value="'+x[0]+'"'+(v===x[0]?' selected':'')+'>'+x[1]+'</option>'; }).join(''); };
    var objOpts=function(v){ return '<option value="">เลือก Objective</option>'+objs.map(function(o){ return '<option value="'+o.code+'"'+(v===o.code?' selected':'')+'>'+o.code+' · '+esc(o.title.slice(0,50))+'</option>'; }).join(''); };
    var fromOpts=function(v){ return '<option value="">ไม่มี (เรื่องใหม่)</option>'+list.map(function(r){ return '<option value="'+r.id+'"'+(v===r.id?' selected':'')+'>'+r.id+'</option>'; }).join(''); };
    var adds=s.adds.map(function(a, i){
      return '<div class="yr-add-r" id="ye-add-'+i+'">'+(edit ?
        '<div class="yr-add-top"><span class="mono ye-nid">'+addIds[i]+'</span><select class="rf-sel" data-ye-new="'+i+':sub" aria-label="บริษัท">'+subOpts(a.sub)+'</select><select class="rf-sel" data-ye-new="'+i+':cat" aria-label="ประเภท">'+catOpts(a.cat)+'</select>'+
          '<select class="rf-sel" data-ye-new="'+i+':obj" aria-label="Objective">'+objOpts(a.obj)+'</select><label class="ye-f yr-from"><span>สืบเนื่องจาก</span><select class="rf-sel" data-ye-new="'+i+':from">'+fromOpts(a.from)+'</select></label><button type="button" class="ye-del" data-ye-del="'+i+'" aria-label="ลบ">&times;</button></div>'+
        '<textarea class="qr-cm" rows="2" data-ye-new="'+i+':title" aria-label="ชื่อความเสี่ยงใหม่" placeholder="ชื่อความเสี่ยง เขียนเป็นเหตุการณ์ในอนาคต เช่น … อาจ … ส่งผลให้ …">'+esc(a.title||"")+'</textarea>'
        : '<span class="mono ye-nid">'+addIds[i]+'</span> '+esc(a.title||"")+(a.obj?' · <span class="mono">'+a.obj+'</span>':''))+'</div>'; }).join('');
    return '<div class="rv-bar"><h3>ระบุความเสี่ยงใหม่ตาม Objective ปี '+YE.to+'</h3></div>'+
      '<p class="rv-help">ไล่ทีละ Objective ว่าความเสี่ยงที่ยกไปครอบคลุมหรือยัง Objective ที่ขึ้นสีส้มยังไม่มีความเสี่ยงรองรับ ให้พิจารณาว่ามีเหตุการณ์ใดที่ทำให้ไม่ถึงเป้า</p>'+
      '<div class="yr-os">'+rows+'</div>'+
      '<h4 class="rv-h4">ความเสี่ยงใหม่ปี '+YE.to+' <span class="rf-n">'+s.adds.length+'</span></h4>'+(adds||'<div class="ov-none">ยังไม่มี · กด "+ เพิ่มความเสี่ยง" ที่ Objective ด้านบน</div>')+yrNext(3); }
  function yr3(s, items, edit){
    function num(id, k, v){ return '<select class="rf-sel yr-n" data-yr-p="'+id+'|'+k+'" aria-label="'+k+' '+id+'"><option value="">–</option>'+[1,2,3,4].map(function(n){ return '<option'+(+v===n?' selected':'')+'>'+n+'</option>'; }).join('')+'</select>'; }
    function lv(L, I){ return L && I ? levelPill(LV_NAME[levelForLICorrect(+L,+I)]) : '<span class="qr-none">—</span>'; }
    var rows=items.map(function(it){ var p=it.p;
      return '<tr class="'+(it.done?'':'yr-todo')+'"><td><span class="mono ye-nid">'+it.id+'</span><div class="ye-t">'+esc(it.t||'(ยังไม่ตั้งชื่อ)')+'</div><div class="ye-from">'+(it.from.length?'สืบเนื่องจาก '+it.from.join(' + '):'เรื่องใหม่')+'</div></td>'+
        '<td>'+(it.cur?lvPillLI(it.cur):'<span class="qr-none">—</span>')+'</td>'+
        '<td>'+(edit ? '<div class="yr-li">'+num(it.id,"bL",p.bL)+'×'+num(it.id,"bI",p.bI)+'</div>' : '<span class="mono">'+(p.bL||'–')+'×'+(p.bI||'–')+'</span>')+'<div class="yr-lv">'+lv(p.bL,p.bI)+'</div></td>'+
        '<td>'+(edit ? '<div class="yr-li">'+num(it.id,"tL",p.tL)+'×'+num(it.id,"tI",p.tI)+'</div>' : '<span class="mono">'+(p.tL||'–')+'×'+(p.tI||'–')+'</span>')+'<div class="yr-lv">'+lv(p.tL,p.tI)+'</div></td>'+
        '<td>'+(edit ? '<select class="rf-sel" data-yr-p="'+it.id+'|t4" aria-label="4T '+it.id+'">'+T4.map(function(o){ return '<option'+(p.t4===o?' selected':'')+'>'+o+'</option>'; }).join('')+'</select>' : esc(p.t4))+'</td></tr>'; }).join('');
    var n=items.filter(function(it){ return it.done; }).length;
    return '<div class="rv-bar"><h3>Baseline และ Target ปี '+YE.to+'</h3><span class="qr-prog">กำหนดแล้ว <b>'+n+'</b> จาก '+items.length+' เรื่อง</span></div>'+
      '<p class="rv-help">Baseline คือระดับที่จะเสนอ RMC เห็นชอบเป็นจุดตั้งต้นของปี '+YE.to+' เรื่องที่ยกมาตั้งค่าเริ่มต้นเป็นระดับปัจจุบันและ Target เดิมให้แล้ว แก้ได้ · เรื่องใหม่ต้องกำหนดเอง</p>'+
      (items.length ? '<div class="qr-tw"><table class="qr-t yr-t"><thead><tr><th>ความเสี่ยงปี '+YE.to+'</th><th>ระดับ '+QCUR.label+'</th><th>Baseline '+YE.to+' (L×I)</th><th>Target (L×I)</th><th>4T</th></tr></thead><tbody>'+rows+'</tbody></table></div>' : '<div class="ov-none">ยังไม่มีความเสี่ยงปี '+YE.to+' · เลือก "ยกไป" ในขั้นที่ 1 หรือเพิ่มใหม่ในขั้นที่ 2</div>')+yrNext(4); }
  function yr4(s, items, list, edit){
    var closed=list.filter(function(r){ var d=s.dec[r.id]; return d && d.d==="close"; });
    var byLv={"สูงมาก":0,"สูง":0,"ปานกลาง":0,"ต่ำ":0}; items.forEach(function(it){ if(it.p.bL&&it.p.bI) byLv[LV_NAME[levelForLICorrect(+it.p.bL,+it.p.bI)]]++; });
    var canX=currentUser && can("Export รายงาน");
    var prof='<ol class="ye-pl">'+items.map(function(it){ return '<li><span class="mono ye-nid">'+it.id+'</span><div><div>'+esc(it.t||'(ยังไม่ตั้งชื่อ)')+'</div><div class="ye-from">'+
        (it.from.length?'สืบเนื่องจาก '+it.from.join(' + ')+(it.ren?' · เปลี่ยนชื่อ':'')+(it.from.length>1?' · รวม '+it.from.length+' เรื่อง':''):'เรื่องใหม่')+
        ' · Baseline '+(it.p.bL&&it.p.bI?it.p.bL+'×'+it.p.bI:'–')+' → Target '+(it.p.tL&&it.p.tI?it.p.tL+'×'+it.p.tI:'–')+' · '+esc(it.p.t4)+'</div></div></li>'; }).join('')+'</ol>';
    var res = edit ? '<div class="rv5-res" role="group" aria-label="มติ RMC">'+YR_RES.map(function(o){ var on=s.rmc.res===o; return '<button type="button" class="'+(on?'on':'')+'" aria-pressed="'+on+'" data-yr-res="'+o+'">'+o+'</button>'; }).join('')+'</div>'+
        '<textarea class="qr-cm" rows="2" id="yrRmcNote" aria-label="รายละเอียดมติ RMC" placeholder="รายละเอียดมติ เช่น เงื่อนไข หรือเรื่องที่ให้แก้">'+esc(s.rmc.note||"")+'</textarea>'
      : (s.rmc.res ? '<span class="rv5-rro">'+esc(s.rmc.res)+'</span>'+(s.rmc.note?'<div class="qr-cmro">'+esc(s.rmc.note)+'</div>':'') : '<span class="qr-none">ยังไม่บันทึก</span>');
    return '<div class="rv-bar"><h3>เสนอ RMC · Risk Profile '+YE.to+'</h3>'+(canX?'<button type="button" class="ra-btn primary" data-yr-slides="1"'+(items.length?'':' disabled')+'>'+icon("download")+'สร้างสไลด์ Risk Profile</button>':'')+'</div>'+
      '<div class="yr-sum"><span>ความเสี่ยงปี '+YE.to+' <b class="mono">'+items.length+'</b></span><span>ยกมา '+items.filter(function(i){ return i.add==null; }).length+' · ใหม่ '+s.adds.length+'</span><span>ปิดสิ้นปี '+YE.from+' <b class="mono">'+closed.length+'</b></span>'+
        '<span>Baseline: สูงมาก '+byLv["สูงมาก"]+' · สูง '+byLv["สูง"]+' · ปานกลาง '+byLv["ปานกลาง"]+' · ต่ำ '+byLv["ต่ำ"]+'</span></div>'+
      '<h4 class="rv-h4">รายการ Risk Profile '+YE.to+'</h4>'+prof+
      (closed.length?'<h4 class="rv-h4">ปิดสิ้นปี '+YE.from+'</h4><ol class="ye-pl">'+closed.map(function(r){ return '<li><span class="mono ye-nid">'+r.id+'</span><div><div>'+esc(r.title)+'</div><div class="ye-from">'+esc(s.dec[r.id].note||"")+'</div></div></li>'; }).join('')+'</ol>':'')+
      '<h4 class="rv-h4">มติ RMC · '+esc(YE.rmc)+'</h4><div class="rv5-m">'+res+'</div>'+yrNext(5); }
  function yr5(s, items, list, c, edit){
    var nAct=0; items.forEach(function(it){ (it.from||[]).forEach(function(id){ var r=riskById(id); if(r) r.factors.forEach(function(f){ (f.acts||[]).forEach(function(a){ if(a.status!=="done") nAct++; }); }); }); });
    var ok1=!c.none, ok2=items.length && items.every(function(it){ return it.done; }), ok3=s.rmc.res==="เห็นชอบ"||s.rmc.res==="เห็นชอบโดยมีเงื่อนไข", all=ok1&&ok2&&ok3;
    function ck(ok, t, n){ return '<li class="'+(ok?'ok':'')+'"><span class="yr-ck" aria-hidden="true">'+(ok?'✓':'')+'</span><span>'+t+'</span>'+(ok?'':'<button type="button" class="rf-clear" data-yr-step="'+n+'">ไปขั้นที่ '+n+'</button>')+'</li>'; }
    var list5='<ul class="yr-cl">'+ck(ok1,'ตัดสินใจความเสี่ยงปี '+YE.from+' ครบทุกเรื่อง',1)+ck(ok2,'กำหนด Baseline และ Target ปี '+YE.to+' ครบทุกเรื่อง',3)+ck(ok3,'RMC เห็นชอบ Risk Profile '+YE.to,4)+'</ul>';
    var out='<ul class="yr-will"><li>ออกรหัสปี '+YE.to+' ให้ '+items.length+' เรื่อง พร้อม Baseline และ Target ที่ RMC เห็นชอบ</li><li>ยกแนวทางจัดการที่ยังไม่เสร็จ '+nAct+' ข้อไปอยู่ใต้ความเสี่ยงปี '+YE.to+'</li><li>เก็บข้อมูลปี '+YE.from+' เป็นประวัติแบบอ่านอย่างเดียว ดูย้อนหลังผ่าน "สืบเนื่องจาก"</li></ul>';
    var act;
    if(s.opened) act='<div class="rv-closed">'+icon("check")+'<div><b>เปิดปี '+YE.to+' แล้ว</b>โดย '+esc(s.opened.by)+' · '+thDate(s.opened.d)+' · ในต้นแบบนี้หน้าอื่นยังแสดงข้อมูลปี '+YE.from+'</div></div>';
    else if(!edit) act='<div class="rv-help">รอ Risk ส่วนกลางเปิดปีใหม่</div>';
    else if(yrAsk) act='<div class="rv-ask" role="alert"><div><b>ยืนยันเปิดปี '+YE.to+'?</b>หลังเปิดปีใหม่จะแก้การทบทวนประจำปีนี้ไม่ได้</div><button type="button" class="ra-btn" data-yr-open="no">ยกเลิก</button><button type="button" class="ra-btn primary" data-yr-open="yes">เปิดปี '+YE.to+'</button></div>';
    else act='<div class="rv-closebar"><span>'+(all?'พร้อมเปิดปีใหม่':'ทำรายการด้านบนให้ครบก่อน')+'</span><button type="button" class="ra-btn'+(all?' primary':'')+'" data-yr-open="ask"'+(all?'':' disabled')+'>เปิดปี '+YE.to+'</button></div>';
    return '<div class="rv-bar"><h3>เปิดปี '+YE.to+'</h3></div>'+list5+'<h4 class="rv-h4">เมื่อเปิดปีใหม่ ระบบจะ</h4>'+out+act; }
  /* สไลด์ Risk Profile (.pptx) */
  function yrSlides(){ var s=yeS(), items=yrItems(s), list=yeList(); if(!items.length) return; toast("กำลังสร้างสไลด์");
    loadLib("pptx").then(function(){ var P=new window.PptxGenJS(); P.layout="LAYOUT_WIDE"; P.author="Risk Management PCC"; P.title="Risk Profile "+YE.to;
      var F="Tahoma", NAVY="1F236B", INK="14161C", MUT="6B7280", LINE="D5DAE3", pg=0;
      var LV={"l-crit":["D92D20","FBE6E3","8A1C14"],"l-high":["E6870C","FDEFD9","8A4A05"],"l-mid":["CAA400","FBF2CF","7A5B00"],"l-low":["1A9A51","E2F4E8","0F5B32"]};
      function T(sl, text, o){ var x={fontFace:F, fontSize:12, color:INK, margin:0, isTextBox:true, valign:"top"}; for(var k in o) x[k]=o[k]; sl.addText(text, x); }
      function frame(t, sub){ var sl=P.addSlide(); pg++; T(sl, t, {x:0.6, y:0.35, w:12.1, h:0.7, fontSize:24, bold:true, color:NAVY, valign:"middle"}); if(sub) T(sl, sub, {x:0.6, y:1.05, w:12.1, h:0.35, color:MUT});
        T(sl, "Risk Profile "+YE.to+" · เสนอ "+YE.rmc, {x:0.6, y:7.0, w:9, h:0.3, fontSize:9, color:MUT}); T(sl, String(pg+1), {x:12.2, y:7.0, w:0.5, h:0.3, fontSize:9, color:MUT, align:"right"}); return sl; }
      var sl=P.addSlide(); sl.background={color:NAVY};
      T(sl, "Risk Profile "+YE.to, {x:0.8, y:2.4, w:11.5, h:1.0, fontSize:40, bold:true, color:"FFFFFF"});
      T(sl, "ผลการทบทวนความเสี่ยงประจำปี "+YE.from, {x:0.8, y:3.45, w:11.5, h:0.6, fontSize:20, color:"CADCFC"});
      T(sl, "เสนอ "+YE.rmc+" เพื่อพิจารณาเห็นชอบ", {x:0.8, y:4.15, w:11.5, h:0.5, fontSize:16, color:"FFFFFF"});
      T(sl, "จัดทำโดย Risk Management PCC · ข้อมูล ณ "+asofFull(), {x:0.8, y:6.6, w:11.5, h:0.4, fontSize:11, color:"AEB5CF"});
      var closed=list.filter(function(r){ var d=s.dec[r.id]; return d && d.d==="close"; }), merged=list.filter(function(r){ var d=s.dec[r.id]; return d && d.d==="merge"; });
      sl=frame("สรุปการทบทวน", "ความเสี่ยงปี "+YE.from+" "+list.length+" เรื่อง → ปี "+YE.to+" "+items.length+" เรื่อง");
      [["ยกไปปี "+YE.to, items.filter(function(i){ return i.add==null; }).length, "233A95","E6EAFC"],["รวมกับเรื่องอื่น", merged.length, "4A3AA6","EEEBFD"],["ปิดสิ้นปี "+YE.from, closed.length, "5B6472","EEF1F3"],["ความเสี่ยงใหม่", s.adds.length, "0F5B32","E2F4E8"]].forEach(function(b, i){ var x=0.6+i*3.05;
        sl.addShape(P.ShapeType.roundRect, {x:x, y:1.7, w:2.85, h:1.4, rectRadius:0.08, fill:{color:b[3]}, line:{color:b[3]}});
        T(sl, String(b[1]), {x:x+0.2, y:1.8, w:2.4, h:0.75, fontSize:36, bold:true, color:b[2]}); T(sl, b[0], {x:x+0.2, y:2.6, w:2.4, h:0.35, fontSize:13, color:b[2]}); });
      var cw=2.2, ch=0.95, x0=1.6, y0=3.55;
      T(sl, "Baseline ปี "+YE.to, {x:0.6, y:3.25, w:6, h:0.3, fontSize:12, bold:true, color:NAVY});
      for(var L=4; L>=1; L--) for(var I=1; I<=4; I++){ var c=LV[levelForLICorrect(L,I)], cx=x0+(I-1)*cw, cy=y0+(4-L)*ch, ids=items.filter(function(it){ return +it.p.bL===L && +it.p.bI===I; }).map(function(it){ return it.id; });
        sl.addShape(P.ShapeType.rect, {x:cx, y:cy, w:cw-0.05, h:ch-0.05, fill:{color:c[1]}, line:{color:"FFFFFF", width:0}});
        if(ids.length) T(sl, ids.join("  "), {x:cx+0.06, y:cy+0.05, w:cw-0.17, h:ch-0.12, fontSize:ids.length>3?7.5:9, color:c[2], bold:true}); }
      for(var k=1; k<=4; k++){ T(sl, "I"+k, {x:x0+(k-1)*cw, y:y0+4*ch, w:cw, h:0.25, fontSize:10, color:MUT, align:"center"}); T(sl, "L"+(5-k), {x:x0-0.5, y:y0+(k-1)*ch+0.3, w:0.4, h:0.3, fontSize:10, color:MUT, align:"right"}); }
      for(var i0=0; i0<items.length; i0+=11){ var chunk=items.slice(i0, i0+11);
        sl=frame("Risk Profile "+YE.to+(items.length>11?" ("+(i0/11+1)+"/"+Math.ceil(items.length/11)+")":""), "Baseline และ Target ที่เสนอให้เห็นชอบ");
        var rows=[["รหัส","ความเสี่ยง","Baseline","Target","4T","สืบเนื่องจาก"].map(function(h){ return {text:h, options:{bold:true, color:MUT}}; })].concat(chunk.map(function(it){
          function lvc(L, I){ if(!L||!I) return {text:"–"}; var cc=LV[levelForLICorrect(+L,+I)]; return {text:LV_NAME[levelForLICorrect(+L,+I)]+" "+L+"×"+I, options:{color:cc[2], fill:{color:cc[1]}, bold:true}}; }
          return [{text:it.id, options:{fontFace:"Consolas", color:"233A95"}}, {text:it.t||""}, lvc(it.p.bL,it.p.bI), lvc(it.p.tL,it.p.tI), {text:it.p.t4}, {text:it.from.length?it.from.join(" + "):"เรื่องใหม่", options:{color:MUT}}]; }));
        sl.addTable(rows, {x:0.6, y:1.55, w:12.1, colW:[1.55,5.6,1.35,1.35,0.95,1.3], fontFace:F, fontSize:9.5, color:INK, border:{type:"solid", pt:0.5, color:LINE}, margin:0.05, valign:"middle", autoPage:false}); }
      if(closed.length){ sl=frame("ความเสี่ยงที่ปิดสิ้นปี "+YE.from, closed.length+" เรื่อง");
        T(sl, closed.map(function(r, i){ return {text:r.id+"  "+r.title+(s.dec[r.id].note?"  ·  "+s.dec[r.id].note:""), options:{bullet:true, breakLine:i<closed.length-1}}; }), {x:0.6, y:1.6, w:12.1, h:5.2, fontSize:12, paraSpaceAfter:6}); }
      return P.write({outputType:"blob"}).then(function(blob){ return saveFile("PRECISE_RiskProfile_"+YE.to+".pptx", blob); });
    }).catch(function(){ toast("สร้างสไลด์ไม่สำเร็จ ลองใหม่อีกครั้ง"); });
  }
  function yrGo(n){ yrStep=n; yrAsk=false; rerenderFilterable(); var b=document.querySelector('.rv-st[data-yr-step="'+n+'"]'); if(b){ b.focus(); var st=document.querySelector(".rv-steps"); if(st && st.getBoundingClientRect().top<0) st.scrollIntoView({block:"start"}); } }
  document.addEventListener("click", function(e){ if(CUR!=="yearly" || !e.target.closest) return; var t, s;
    if((t=e.target.closest("[data-yr-step]"))){ yrGo(+t.getAttribute("data-yr-step")); return; }
    if((t=e.target.closest("[data-ye-add-obj]"))){ s=yeS(); var oc=t.getAttribute("data-ye-add-obj"), dom=oc.charAt(0); s.adds.push({sub:"PCC", cat:({S:"SR",F:"FR",C:"SR",P:"OR",L:"OR",E:"ER"})[dom]||"SR", title:"", from:"", obj:oc}); yeSave(s); rvRerender();
      var el=document.getElementById("ye-add-"+(s.adds.length-1)); if(el){ el.scrollIntoView({block:"center"}); var ta=el.querySelector("textarea"); if(ta) ta.focus(); } return; }
    if((t=e.target.closest("[data-yr-res]"))){ s=yeS(); var v=t.getAttribute("data-yr-res"); s.rmc.res = s.rmc.res===v ? "" : v; s.rmc.d=ASOF; yeSave(s); logAudit("", "risk", "มติ RMC ต่อ Risk Profile "+YE.to+": "+(s.rmc.res||"ยกเลิก"), []); rvRerender(); return; }
    if(e.target.closest("[data-yr-slides]")){ yrSlides(); return; }
    if((t=e.target.closest("[data-yr-open]"))){ var o=t.getAttribute("data-yr-open"); if(o==="ask"){ yrAsk=true; rvRerender(); return; } if(o==="no"){ yrAsk=false; rvRerender(); return; }
      s=yeS(); s.opened={d:ASOF, by:currentUser.name}; yeSave(s); yrAsk=false; rvRerender(); toast("เปิดปี "+YE.to+" แล้ว"); return; }
  });
  document.addEventListener("change", function(e){ if(CUR!=="yearly" || !e.target.getAttribute) return; var a, s;
    if((a=e.target.getAttribute("data-yr-p"))){ var p=a.split("|"); s=yeS(); s.prof[p[0]]=s.prof[p[0]]||{}; s.prof[p[0]][p[1]]=e.target.value; yeSave(s); rvRerender(); return; }
    if(e.target.id==="yrRmcNote"){ s=yeS(); s.rmc.note=e.target.value; yeSave(s); return; }
  });

  /* start */
  applyRiskEdits(); applyRmcDecs();
  (function(){ var saved=null; try{ saved=localStorage.getItem("prc-demo-user"); }catch(err){}
    if(saved && DEMO_USERS.some(function(u){ return u.id===saved; })){ loginAs(saved, true); runPending(); } else { build(); showLogin(); } })();
})();
