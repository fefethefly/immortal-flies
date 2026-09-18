import {integer,requireValue} from './codec.mjs';
import {motorInput} from './relay-motor-input.mjs';

// Direct handwritten actuation. NOT neural spikes, learning or an upgrade to
// runtime.mjs. Reuses only observation selection and relative bearing parsing.
export const REACTIVE_MOTOR_POLICY = Object.freeze({
  id:'reactive-motor-control/1',controller:'handwritten-not-neural',
  deadband:9,turnDegrees:9,forwardCount:6,worldSize:10000,
});
export function reactiveMotor(pending,context) {
  const {error,observation}=motorInput(pending,context,'dual');
  let left=0,right=0;
  if(error!==null){
    if(Math.abs(error)<=REACTIVE_MOTOR_POLICY.deadband)left=right=REACTIVE_MOTOR_POLICY.forwardCount;
    else if(error>0)right=1;
    else left=1;
  }
  return {policy:REACTIVE_MOTOR_POLICY.id,controller:REACTIVE_MOTOR_POLICY.controller,
    error,observation,left,right};
}

/** Handwritten motion control: mirrors the kernel's geometric integration,
 * but supplies motor counts directly. This bypass is explicit, never neural. */
export function applyReactiveMotor(body,command) {
  integer(body.x,0,10000,'x');integer(body.y,0,10000,'y');integer(body.heading,0,359,'heading');
  requireValue(command.policy===REACTIVE_MOTOR_POLICY.id&&command.controller==='handwritten-not-neural','REACTIVE_POLICY');
  integer(command.left,0,6,'left');integer(command.right,0,6,'right');
  const heading=(body.heading+Math.sign(command.right-command.left)*9+360)%360;
  const axes=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const [dx,dy]=axes[Math.floor(heading/45)],speed=Math.min(35,(command.left+command.right)*3);
  const x=Math.max(0,Math.min(10000,body.x+dx*speed));
  const y=Math.max(0,Math.min(10000,body.y+dy*speed));
  return {...body,x,y,heading:x===0||x===10000||y===0||y===10000?(heading+135)%360:heading};
}
