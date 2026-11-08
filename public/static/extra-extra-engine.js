export const ROUTE_SECONDS=90
export const RIDER_X=98
export const GROUND=326
export function createGame(width=960,random=Math.random){return {mode:'ready',width,random,time:0,score:0,deliveries:0,combo:0,lives:3,jump:0,velocity:0,speed:185,scroll:0,obstacles:[],houses:[],papers:[],particles:[],obstacleIn:3.3,houseIn:1.2,cooldown:0,invincible:0,message:'A cidade está esperando o jornal.',messageFor:3}}
export function startGame(game){const width=game.width,random=game.random;Object.assign(game,createGame(width,random),{mode:'running'})}
export function jumpGame(game){if(game.mode!=='running'||game.jump>1)return false;game.velocity=465;game.jump=2;return true}
export function deliveryTarget(game){return game.houses.filter(h=>!h.delivered&&!h.missed&&h.x>=RIDER_X+28&&h.x<=RIDER_X+235).sort((a,b)=>a.x-b.x)[0]||null}
export function throwPaper(game){
 if(game.mode!=='running'||game.cooldown>0)return false
 game.cooldown=.28
 const house=deliveryTarget(game),paper={x:RIDER_X+18,y:GROUND-65-game.jump,age:0,duration:.48,house}
 game.papers.push(paper)
 if(house){house.delivered=true;game.deliveries++;game.combo++;const points=100+Math.min(game.combo-1,4)*25;game.score+=points;game.message=game.combo>1?`${game.combo} entregas seguidas! +${points}`:`Jornal entregue! +${points}`;game.messageFor=2.2;return true}
 game.message='Espere a caixa ficar sinalizada.';game.messageFor=1.6;return false
}
function loseChance(game,message){
 if(game.invincible>0)return
 game.lives=Math.max(0,game.lives-1);game.combo=0;game.invincible=1.35;game.message=message;game.messageFor=2
 if(!game.lives)game.mode='over'
}
export function stepGame(game,delta){
 if(game.mode!=='running')return
 const dt=Math.max(0,Math.min(delta,.05));game.time=Math.min(ROUTE_SECONDS,game.time+dt);game.speed=185+Math.min(55,game.time*.7);game.scroll+=game.speed*dt
 game.cooldown=Math.max(0,game.cooldown-dt);game.invincible=Math.max(0,game.invincible-dt);game.messageFor=Math.max(0,game.messageFor-dt)
 if(game.jump>0||game.velocity>0){game.jump+=game.velocity*dt;game.velocity-=1180*dt;if(game.jump<=0){game.jump=0;game.velocity=0}}
 game.obstacleIn-=dt;game.houseIn-=dt
 if(game.obstacleIn<=0){game.obstacles.push({x:game.width+45,type:Math.floor(game.random()*3),hit:false});game.obstacleIn=2.6+game.random()*1.4}
 if(game.houseIn<=0){game.houses.push({x:game.width+110,color:Math.floor(game.random()*4),delivered:false,missed:false});game.houseIn=4.1+game.random()*1.4}
 for(const obstacle of game.obstacles){obstacle.x-=game.speed*dt;if(!obstacle.hit&&Math.abs(obstacle.x-RIDER_X)<28&&game.jump<(obstacle.type===1?20:43)){obstacle.hit=true;loseChance(game,'Um obstáculo! Ainda dá para seguir.')}}
 for(const house of game.houses){house.x-=game.speed*dt;if(!house.delivered&&!house.missed&&house.x<RIDER_X+8){house.missed=true;loseChance(game,'Uma casa ficou sem jornal. Vamos à próxima!')}}
 for(const paper of game.papers)paper.age+=dt
 game.obstacles=game.obstacles.filter(o=>o.x>-80);game.houses=game.houses.filter(h=>h.x>-170);game.papers=game.papers.filter(p=>p.age<p.duration)
 if(game.time>=ROUTE_SECONDS)game.mode='over'
}
export function pauseGame(game){if(game.mode==='running'){game.mode='paused';return true}return false}
export function resumeGame(game){if(game.mode==='paused'){game.mode='running';return true}return false}
