import {RIDER_X,GROUND,deliveryTarget,ROUTE_SECONDS} from './extra-extra-engine.js'
const ink='#234b50'
function box(c,x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.stroke()}}
function line(c,points,color=ink,width=2){c.beginPath();c.strokeStyle=color;c.lineWidth=width;points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke()}
function circle(c,x,y,r,color,stroke){c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(color){c.fillStyle=color;c.fill()}if(stroke){c.strokeStyle=stroke;c.stroke()}}
function text(c,value,x,y,size=12,color=ink,align='center'){c.fillStyle=color;c.font=`600 ${size}px Arial`;c.textAlign=align;c.fillText(value,x,y)}
function tree(c,x,y,size=1){c.save();c.translate(x,y);c.scale(size,size);line(c,[[0,0],[0,-60]],'#82947b',4);circle(c,-13,-53,21,'#b9c7a5');circle(c,13,-58,25,'#adbf98');circle(c,-3,-78,23,'#b5c6a0');line(c,[[0,-18],[-12,-44]],'#8a9e7e',2);c.restore()}
function house(c,h,ready){
 const x=h.x,colors=['#e8c2a0','#c4d6bf','#e6d8a8','#c6d6d5'],wall=colors[h.color]
 c.save();c.lineWidth=1.5
 box(c,x-41,157,135,98,2,wall,'#9aab99')
 c.beginPath();c.moveTo(x-53,158);c.lineTo(x+27,112);c.lineTo(x+106,158);c.closePath();c.fillStyle='#9c7564';c.fill();c.strokeStyle='#80695b';c.stroke();line(c,[[x-49,157],[x+104,157]],'#efddbd',4)
 for(const wx of [x-22,x+57]){box(c,wx,180,21,29,2,'#f9f3d8','#83968a');line(c,[[wx+10.5,180],[wx+10.5,209]],'#a4b1a0',1);line(c,[[wx,194],[wx+21,194]],'#a4b1a0',1)}
 box(c,x+14,199,27,56,3,'#789486','#677e74');circle(c,x+34,229,1.5,'#f2dfa9')
 box(c,x+53,242,36,13,2,'#a8b28e');for(let i=0;i<4;i++){line(c,[[x+57+i*8,245],[x+57+i*8,235-i%2*5]],'#689678',2);circle(c,x+57+i*8,234-i%2*5,3,'#c18565')}
 line(c,[[x,278],[x,299]],'#7d9685',4)
 box(c,x-15,258,30,21,5,h.delivered?'#4f7c60':ready?'#285a4d':'#aabda4',ready?'#174638':'#76927c')
 line(c,[[x-8,267],[x+8,267]],'#f4efd8',2)
 if(h.delivered)text(c,'✓',x,254,19,'#285a4d')
 else if(!h.missed){
  const label=ready?'JORNAL AQUI':'AGUARDANDO',w=ready?106:98
  box(c,x-w/2,225,w,23,5,ready?'#285a4d':'#fff9e8',ready?null:'#d2d8c2');text(c,label,x,240,9,ready?'#fff9e8':'#6a806c')
 }
 c.restore()
}
function obstacle(c,o){
 const x=o.x;c.save();c.lineWidth=2
 if(o.type===0){c.beginPath();c.moveTo(x-16,GROUND-3);c.lineTo(x-4,GROUND-41);c.lineTo(x+4,GROUND-41);c.lineTo(x+16,GROUND-3);c.closePath();c.fillStyle='#cb8c60';c.fill();c.strokeStyle='#ad7452';c.stroke();line(c,[[x-9,GROUND-22],[x+9,GROUND-22]],'#f7edcf',7);box(c,x-22,GROUND-5,44,7,2,'#a87653')}
 else if(o.type===1){c.beginPath();c.ellipse(x,GROUND-2,26,6,0,0,Math.PI*2);c.fillStyle='#a2c0ba';c.fill();line(c,[[x-13,GROUND-3],[x+6,GROUND-3]],'#e0ece1',2);line(c,[[x+10,GROUND],[x+19,GROUND]],'#e0ece1',1.5)}
 else{c.beginPath();c.ellipse(x,GROUND-1,25,7,0,0,Math.PI*2);c.fillStyle='#8c8c73';c.fill();c.beginPath();c.ellipse(x,GROUND-2,17,4,0,0,Math.PI*2);c.fillStyle='#637e74';c.fill();line(c,[[x-22,GROUND-5],[x-15,GROUND-10],[x-9,GROUND-6]],'#9a987b',2)}
 c.restore()
}
function boy(c,g,still){
 c.save();c.translate(RIDER_X,GROUND-g.jump);c.lineCap='round';c.lineJoin='round';c.lineWidth=3
 if(g.invincible>0&&Math.floor(g.time*10)%2===0)c.globalAlpha=.5
 const pedal=still?0:Math.sin(g.scroll*.075),wheel=still?0:g.scroll*.06
 for(const x of [-24,27]){circle(c,x,-18,17,'#f7f2df',ink);circle(c,x,-18,12,null,'#a3b5a4');for(let i=0;i<4;i++){const a=wheel+i*Math.PI/2;line(c,[[x,-18],[x+15*Math.cos(a),-18+15*Math.sin(a)]],'#9aac9c',1)}}
 line(c,[[-24,-18],[-7,-47],[10,-18],[-24,-18]],'#597e65',3.5);line(c,[[-7,-47],[17,-47],[27,-18]],'#597e65',3.5);line(c,[[10,-18],[17,-47],[23,-57],[32,-57]],ink,3);line(c,[[-14,-51],[0,-51]],ink,4)
 circle(c,8,-18,4,'#b6a979',ink)
 line(c,[[-7,-56],[5,-39+pedal*6],[9+pedal*8,-19]],'#3d5d61',7);line(c,[[9+pedal*8,-19],[16+pedal*8,-18]],'#8c6449',4)
 line(c,[[-9,-60],[-21,-38-pedal*6],[5-pedal*9,-18]],'#58716c',7);line(c,[[5-pedal*9,-18],[12-pedal*9,-17]],'#76583f',4)
 c.beginPath();c.moveTo(-19,-86);c.lineTo(-5,-88);c.lineTo(3,-58);c.lineTo(-15,-55);c.closePath();c.fillStyle='#bf7959';c.fill()
 line(c,[[-7,-83],[10,-70],[28,-58]],'#b77e59',6)
 line(c,[[-11,-91],[-9,-86]],'#af7854',7);circle(c,-10,-101,12,'#c49166');circle(c,1,-99,3,'#c49166');circle(c,-4,-103,1.2,ink)
 c.beginPath();c.arc(-11,-105,13,Math.PI,0);c.lineTo(2,-105);c.closePath();c.fillStyle='#31575b';c.fill();box(c,-16,-108,27,4,2,'#31575b');line(c,[[-15,-115],[-6,-115]],'#799685',1.5)
 line(c,[[-20,-87],[-30,-64]],'#6d7460',4);box(c,-43,-76,23,24,4,'#d0b483','#a08b66')
 c.save();c.translate(-34,-81);c.rotate(-.18);box(c,-7,0,16,22,1,'#fff8e5','#9ba496');text(c,'DP',1,8,5,ink);line(c,[[-4,12],[5,12]],'#9ba496',1);c.restore()
 c.restore()
}
export function drawGame(c,g,cssWidth,cssHeight,dpr=1){
 c.setTransform(dpr*cssWidth/g.width,0,0,dpr*cssHeight/400,0,0);c.clearRect(0,0,g.width,400)
 c.lineCap='round';c.lineJoin='round';c.fillStyle='#edf1e5';c.fillRect(0,0,g.width,400)
 circle(c,g.width*.79,61,25,'#ead9a3');circle(c,g.width*.79,61,36,null,'#e2dec0')
 for(let i=0;i<5;i++){const x=((i*257-g.scroll*.07)%(g.width+300)+g.width+300)%(g.width+300)-100;box(c,x,53+i%2*30,66,12,6,'#f7f7eb');box(c,x+17,43+i%2*30,37,19,10,'#f7f7eb')}
 c.fillStyle='#dbe3d1';c.fillRect(0,174,g.width,106)
 for(let i=0;i<Math.ceil(g.width/65)+3;i++){const x=i*65-(g.scroll*.17%65)-65,h=37+(i%4)*16;box(c,x,190-h,50,h+38,2,['#d4ddc9','#cbd9c8','#dce2ce'][i%3]);for(let k=0;k<3;k++)box(c,x+8+k*13,199-h,5,13,1,'#b6c9b5')}
 for(let i=0;i<Math.ceil(g.width/270)+2;i++)tree(c,i*270-(g.scroll*.29%270),254,.8)
 c.fillStyle='#e4dfc8';c.fillRect(0,253,g.width,47);line(c,[[0,284],[g.width,284]],'#cbcdb6',1);line(c,[[0,299],[g.width,299]],'#c2c9b0',3)
 for(let i=0;i<g.width/65+2;i++)line(c,[[i*65-g.scroll%65,286],[i*65-g.scroll%65,298]],'#d1d1bb',1)
 const target=deliveryTarget(g)
 for(const h of g.houses)house(c,h,h===target)
 c.fillStyle='#d6dac5';c.fillRect(0,301,g.width,99);c.fillStyle='#cbd4bd';c.fillRect(0,365,g.width,35)
 for(let i=0;i<g.width/100+2;i++)line(c,[[i*100-g.scroll%100,356],[i*100+40-g.scroll%100,356]],'#eff0d8',3)
 for(const o of g.obstacles)obstacle(c,o)
 c.beginPath();c.ellipse(RIDER_X,GROUND+5,38-Math.min(18,g.jump*.1),5,0,0,Math.PI*2);c.fillStyle='#8fa38855';c.fill()
 boy(c,g,g.mode==='ready')
 for(const p of g.papers){const t=Math.min(1,p.age/p.duration),endX=p.house?p.house.x:RIDER_X+230,endY=p.house?268:p.y-20,x=p.x+(endX-p.x)*t,y=p.y+(endY-p.y)*t-Math.sin(t*Math.PI)*72;c.save();c.translate(x,y);c.rotate(t*5);box(c,-8,-5,17,12,1,'#fffbee','#6b8274');line(c,[[-5,-1],[5,-1]],'#6b8274',1);line(c,[[-5,2],[2,2]],'#6b8274',1);c.restore()}
 text(c,'DIÁRIO DO POVO · RUA DAS BOAS NOTÍCIAS',g.width-16,387,8,'#738e78','right')
 if(g.mode==='running'&&g.time>ROUTE_SECONDS-10)text(c,String(Math.ceil(ROUTE_SECONDS-g.time)),g.width/2,54,28,'#677e63')
}
