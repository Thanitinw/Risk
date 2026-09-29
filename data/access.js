/* PRECISE Risk Management Cockpit — ข้อมูล: Role · ผู้ใช้ตัวอย่าง · สิทธิ์การใช้งาน */
window.PRC = window.PRC || {};

PRC.ROLES = {
    admin: {label:"Admin", sub:"Risk Management PCC", icon:"shield", color:"#0f7a6a", scopeText:"ทุกบริษัท",
            desc:"ดูแลทะเบียนความเสี่ยงทั้งกลุ่ม กำหนดเกณฑ์และแม่แบบ รวบรวมรายงานเสนอคณะกรรมการฯ และจัดการผู้ใช้และสิทธิ์"},
    coord: {label:"Risk Coordinator", sub:"ประจำความเสี่ยงและบริษัทย่อย", icon:"clipboard", color:"#8a6d00", scopeText:"ความเสี่ยง/บริษัทย่อยที่ได้รับมอบหมาย",
            desc:"อัปเดตค่า KRI รายเดือนพร้อมหลักฐาน และช่วยร่างสาเหตุและแนวทางจัดการ ให้ Risk Owner ยืนยัน"},
    owner: {label:"Risk Owner", sub:"ประจำความเสี่ยง", icon:"building", color:"#b4540a", scopeText:"ความเสี่ยงที่เป็นเจ้าของ",
            desc:"เจ้าของความเสี่ยง ยืนยันค่า KRI กำหนดสาเหตุและแนวทางจัดการ และเสนอเกณฑ์ Appetite/Tolerance"},
    audit: {label:"Internal Audit", sub:"ตรวจสอบภายใน", icon:"search", color:"#5b6472", scopeText:"ทุกบริษัท (อ่านอย่างเดียว)",
            desc:"ดูข้อมูลทุกบริษัทแบบอ่านอย่างเดียว ตรวจ Audit Trail และประเมินความเพียงพอของการควบคุม"},
    rmc:   {label:"คณะกรรมการฯ", sub:"RMC / AC / EC / Board", icon:"gavel", color:"#6d4fc0", scopeText:"ทุกบริษัท (อ่านอย่างเดียว)",
            desc:"ดูภาพรวมและรายละเอียดความเสี่ยงทั้งกลุ่มแบบอ่านอย่างเดียว การเห็นชอบและอนุมัติทำในที่ประชุม แล้ว Admin บันทึกมติเข้าระบบ"},
    exec:  {label:"ผู้บริหารของกลุ่ม", sub:"President & Group COO", icon:"crown", color:"#233a95", scopeText:"ทุกบริษัท",
            desc:"ติดตามความเสี่ยงระดับกลุ่มในที่ประชุมรายเดือน และทบทวนก่อนเสนอคณะกรรมการฯ"}
  };

PRC.ROLE_ORDER = ["admin","coord","owner","audit","rmc","exec"];

PRC.DEMO_USERS = [
    {id:"admin", role:"admin", name:"Risk Management PCC", initials:"RM", scope:"ALL", demo:"ทุกบริษัท"},
    {id:"coord", role:"coord", name:"Risk Coordinator PEM", initials:"RC", scope:"PEM", demo:"บริษัทย่อย PEM"},
    {id:"owner", role:"owner", name:"MD PSL",               initials:"MP", scope:"PSL", risks:["PSL-SR-01"], demo:"เจ้าของ PSL-SR-01"},
    {id:"audit", role:"audit", name:"Internal Audit",       initials:"IA", scope:"ALL", demo:"ทุกบริษัท"},
    {id:"rmc",   role:"rmc",   name:"กรรมการ RMC",           initials:"BD", scope:"ALL", demo:"ทุกบริษัท"},
    {id:"exec",  role:"exec",  name:"Group COO",            initials:"GC", scope:"ALL", demo:"ทุกบริษัท"}
  ];

PRC.PERMS = [
    {cap:"ดู Dashboard และ Risk Profile",        admin:"y", coord:"own", owner:"mine", audit:"y", rmc:"y", exec:"y"},
    {cap:"อัปเดตค่า KRI รายเดือน + แนบหลักฐาน",  admin:"y", coord:"own", owner:"mine", audit:"", rmc:"", exec:""},
    {cap:"ยืนยันค่า KRI ก่อนรายงาน",             admin:"ตรวจทาน", coord:"", owner:"mine", audit:"", rmc:"", exec:""},
    {cap:"แก้ไขสาเหตุและแนวทางจัดการ",           admin:"y", coord:"ร่าง", owner:"mine", audit:"", rmc:"", exec:""},
    {cap:"เสนอเพิ่ม/ปิดประเด็นความเสี่ยง",        admin:"y", coord:"", owner:"mine", audit:"", rmc:"อนุมัติในที่ประชุม", exec:"ระดับกลุ่ม"},
    {cap:"กำหนด Appetite / Tolerance",           admin:"เสนอ", coord:"", owner:"เสนอ", audit:"", rmc:"อนุมัติในที่ประชุม", exec:"ทบทวน"},
    {cap:"เห็นชอบ Risk Profile",                 admin:"บันทึกมติ", coord:"", owner:"", audit:"", rmc:"ในที่ประชุม", exec:"ทบทวน"},
    {cap:"ดู Audit Trail",                       admin:"y", coord:"", owner:"mine", audit:"y", rmc:"", exec:""},
    {cap:"Export รายงาน",                        admin:"y", coord:"", owner:"mine", audit:"y", rmc:"y", exec:"y"},
    {cap:"จัดการผู้ใช้และสิทธิ์",                   admin:"y", coord:"", owner:"", audit:"", rmc:"", exec:""}
  ];
