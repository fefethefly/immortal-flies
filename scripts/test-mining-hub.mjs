import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {ContractFactory,JsonRpcProvider,ZeroHash,keccak256,parseEther,toUtf8Bytes} from 'ethers';
import {compileLife} from './compile-life.mjs';
import {deploySoulCollection} from './life-soul-factory.mjs';
import {bindManifest,encodeGraph} from '../src/brain/graph.mjs';
import {createState} from '../src/brain/runtime.mjs';
import {runTrajectory,selectProbes} from '../src/brain/flyswarm/segment.mjs';
import {fromTrajectory,journalCheckpointRoot,probeSeed,adjudicationRecordHash} from '../src/life/mining-archive.mjs';
import {applyJournalInputs} from '../src/life/private-runner.mjs';

const artifacts=compileLife();
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
const child=spawn('anvil',['--host','127.0.0.1','--port',String(port),'--chain-id','31337','--silent'],{stdio:['ignore','ignore','pipe']});
let launchError;child.on('error',e=>launchError=e);
const provider=new JsonRpcProvider(`http://127.0.0.1:${port}`,31337,{cacheTimeout:-1});provider.pollingInterval=10;
const checks=[];
const pass=s=>{checks.push(s);console.log('PASS '+s)};
const tx=async p=>{const r=await(await p).wait();assert.equal(r.status,1);return r};
const mine=n=>provider.send('anvil_mine',['0x'+n.toString(16)]);
const increase=async (seconds)=>{await provider.send('evm_increaseTime',[seconds]);await mine(1)};
const rejectTx=async p=>assert.rejects(async()=>{await tx(p)});
const claimIf=async (hub,signer)=>{
  const who=await signer.getAddress();
  if ((await hub.refunds(who))>0n) await tx(hub.connect(signer).claimRefund());
};
  const tankOf=async (hub,id)=>{
  const t=await hub.tanks(id);
  return {owner:t.owner,lifeId:t.lifeId,ownerFuel:t.ownerFuel,giftFuel:t.giftFuel,reserved:t.reserved,runner:t.runner,fee:t.fee,steps:t.steps,spendCap:t.spendCap,spent:t.spent};
};
const opOf=async (hub,who)=>{
  const o=await hub.operators(who);
  return {roles:o.roles,status:o.status,bond:o.bond,exposure:o.exposure,accepted:o.accepted,disputed:o.disputed,lost:o.lost};
};
function tinyGraph(){
  return bindManifest(encodeGraph({
    schema:'iff.connectome/1',
    nodes:[{id:'a',sign:1},{id:'b',sign:1},{id:'c',sign:-1},{id:'d',sign:1}],
    groups:{food:[0,1],threat:[0],light:[1],left:[2],right:[3]},
  },[
    {pre:0,post:1,weight:10},{pre:1,post:0,weight:10},{pre:1,post:2,weight:5},
    {pre:2,post:3,weight:7},{pre:3,post:0,weight:3},
  ]),'mining-hub-anvil');
}
async function commitSegment({hub,journal,soul,runner,ownerSigner,tokenId,segmentId,trajectory,uri}){
  const hubAddr=await hub.getAddress();
  const packed=fromTrajectory(trajectory,{chainId:31337,hub:hubAddr,tokenId,segmentId});
  await tx(hub.connect(runner).openSegment(segmentId,tokenId,packed.commitment.steps,packed.commitment.startRoot));
  const epoch=await soul.controlEpoch(tokenId);
  const previous=(await journal.heads(tokenId)).checkpointRoot;
  const through=Number((await journal.heads(tokenId)).inputCount);
  await tx(journal.connect(runner).checkpoint(tokenId,epoch,previous,through,packed.commitment.finalRoot,packed.archiveHash,uri));
  const head=await journal.heads(tokenId);
  const expectedRoot=journalCheckpointRoot({
    chainId:31337,journal:await journal.getAddress(),tokenId,epoch,sequence:head.sequence,previous,
    throughInput:head.inputCount,inputRoot:head.inputRoot,modelHash:await soul.modelHash(),
    stateRoot:packed.commitment.finalRoot,archiveHash:packed.archiveHash,uri,
  });
  assert.equal(head.checkpointRoot,expectedRoot);
  await tx(hub.connect(runner).commitPrivate(segmentId,packed.commitment,epoch,previous,uri));
  return packed;
}

try{
 for(let i=0;i<80;i++){if(launchError)throw launchError;try{await provider.getBlockNumber();break}catch{if(i===79)throw new Error('Anvil failed');await new Promise(r=>setTimeout(r,100))}}
 const [owner,other,runner,hiveSigner,challenger]=await Promise.all([0,1,2,3,4].map(i=>provider.getSigner(i)));
 const [a,b,c,hive,d]=await Promise.all([owner,other,runner,hiveSigner,challenger].map(x=>x.getAddress()));
 const genesis=JSON.parse(fs.readFileSync('public/life-genesis/current.json'));
 const {soul}=await deploySoulCollection(artifacts,owner,genesis,'https://example.invalid'+genesis.manifestPath);
 const soulAddr=await soul.getAddress();
 await tx(soul.requestHatch('Ember'));
 await mine(3);
 await tx(soul.hatch(1));
 await tx(soul.connect(other).requestHatch('Moss'));
 await mine(3);
 await tx(soul.hatch(2));
 const journal=await new ContractFactory(artifacts.LifeJournal.abi,artifacts.LifeJournal.bytecode,owner).deploy(soulAddr);
 await journal.waitForDeployment();
 const journalAddr=await journal.getAddress();
 const tax=await new ContractFactory(artifacts.MockIFSTax.abi,artifacts.MockIFSTax.bytecode,owner).deploy();
 await tax.waitForDeployment();
 const taxAddr=await tax.getAddress();
 await rejectTx(new ContractFactory(artifacts.MiningHub.abi,artifacts.MiningHub.bytecode,owner).deploy(soulAddr,journalAddr,taxAddr,taxAddr));
 await rejectTx(new ContractFactory(artifacts.MiningHub.abi,artifacts.MiningHub.bytecode,owner).deploy(soulAddr,journalAddr,taxAddr,'0x055bB2aF42B832A55F3D708c92824C491dE05427'));
 const {soul:foreignSoul}=await deploySoulCollection(artifacts,owner,genesis,'https://example.invalid/foreign');
 const foreignJournal=await new ContractFactory(artifacts.LifeJournal.abi,artifacts.LifeJournal.bytecode,owner).deploy(await foreignSoul.getAddress());
 await foreignJournal.waitForDeployment();
 await rejectTx(new ContractFactory(artifacts.MiningHub.abi,artifacts.MiningHub.bytecode,owner).deploy(soulAddr,await foreignJournal.getAddress(),taxAddr,hive));
 const hub=await new ContractFactory(artifacts.MiningHub.abi,artifacts.MiningHub.bytecode,owner).deploy(soulAddr,journalAddr,taxAddr,hive);
 await hub.waitForDeployment();
 const hubAddr=await hub.getAddress();
 assert.equal(await hub.soul(),soulAddr);
 assert.equal(await hub.journal(),journalAddr);
 assert.equal(await hub.ifs(),taxAddr);
 assert.equal(await hub.hive(),hive);
 assert.equal(await hub.operator(),a);
 assert.equal(hub.interface.fragments.some(x=>['setModule','upgradeTo'].includes(x.name)),false);
 assert.ok(artifacts.MiningHub.deployedBytes<=24576);
 pass('constructor pins soul/journal/ifs/hive; rejects hive=ifs, ops wallet, and a journal from another soul');

 const mint=parseEther('1000');
 for(const who of [a,b,c,d]) await tx(tax.mint(who,mint));
 await tx(tax.connect(owner).approve(hubAddr,mint));
 await tx(tax.connect(other).approve(hubAddr,mint));
 await tx(tax.connect(runner).approve(hubAddr,mint));
 await tx(tax.connect(challenger).approve(hubAddr,mint));
 const sentBond=parseEther('10');
 const taxOn=x=>x-x/100n;
 await rejectTx(hub.connect(runner).registerOperator(1,sentBond));
 await tx(hub.setAllowlisted(c,true));
 await tx(hub.setAllowlisted(d,true));
 await tx(hub.connect(runner).registerOperator(1,sentBond));
 const runnerOp=await opOf(hub,c);
 assert.equal(runnerOp.status,1n);
 assert.equal(runnerOp.roles,1n);
 assert.equal(runnerOp.bond,taxOn(sentBond));
 await rejectTx(hub.connect(runner).registerOperator(1,sentBond));
 await tx(hub.connect(challenger).registerOperator(1,sentBond));
 const beforeOwner=await tax.balanceOf(a);
 await tx(hub.refuel(1,parseEther('20')));
 const receivedFuel=taxOn(parseEther('20'));
 assert.equal((await tankOf(hub,1)).ownerFuel,receivedFuel);
 assert.equal(await tax.balanceOf(a),beforeOwner-parseEther('20'));
 const taxLogs=await hub.queryFilter(hub.filters.TaxObserved());
 assert.equal(taxLogs.some(l=>l.args.received===receivedFuel),true);
 await tx(hub.connect(other).giftFuel(1,parseEther('5')));
 assert.equal((await tankOf(hub,1)).giftFuel,taxOn(parseEther('5')));
 const fee=parseEther('1');
 const spendCap=parseEther('100');
 await tx(hub.bindRunner(1,c,fee,10,spendCap,0));
 assert.equal((await tankOf(hub,1)).runner,c);
 assert.equal((await tankOf(hub,1)).fee,fee);
 assert.equal((await tankOf(hub,1)).steps,10n);
 assert.equal((await tankOf(hub,1)).spendCap,spendCap);
 pass('gate 1: tax pull credits received, not the requested amount; tank/bind/bond use the delta; allowlist required');

 await tx(soul.setRunner(1,c));
 const graph=tinyGraph();
 const state=createState(graph,{seed:43,soulId:'hub-43',branchId:'anvil'});
 const trajectory=await runTrajectory(graph,state,{steps:10,checkpointEvery:10,leafEvery:10});
 const segmentId=keccak256(toUtf8Bytes('seg-private-1'));
 const packed=fromTrajectory(trajectory,{chainId:31337,hub:hubAddr,tokenId:1,segmentId});
 assert.equal(await hub.archiveHashOf(1,segmentId,packed.commitment),packed.archiveHash);
 await commitSegment({hub,journal,soul,runner,tokenId:1,segmentId,trajectory,uri:'ipfs://segment/private-1'});
 const committed=await hub.segments(segmentId);
 assert.equal(committed.status,2n);
 assert.equal(committed.archiveHash,packed.archiveHash);
 await rejectTx(hub.connect(runner).lockSeed(segmentId));
 await mine(3);
 await tx(hub.lockSeed(segmentId));
 const locked=await hub.segments(segmentId);
 const sourceBlock=await provider.getBlock(Number(committed.commitBlock)+2);
 const jsSeed=probeSeed({sourceHash:sourceBlock.hash,segmentId});
 assert.equal(locked.seed,jsSeed);
 assert.equal(await hub.previewSeed(segmentId),jsSeed);
 const probes=await selectProbes({seed:jsSeed,segmentId,steps:10,leafEvery:10,count:1});
 assert.equal(probes.length,1);
 await rejectTx(hub.connect(runner).settlePrivate(segmentId));
 await tx(hub.connect(runner).recordOpening(segmentId,keccak256(toUtf8Bytes('opening'))));
 await rejectTx(hub.connect(runner).settlePrivate(segmentId));
 await increase(24*60*60+1);
 await tx(hub.connect(runner).settlePrivate(segmentId));
 assert.equal((await hub.segments(segmentId)).status,4n);
 assert.equal(await hub.earnings(c),fee);
 assert.equal((await tankOf(hub,1)).reserved,0n);
 assert.equal((await opOf(hub,c)).exposure,0n);
 await rejectTx(hub.connect(runner).settlePrivate(segmentId));
 await tx(hub.connect(runner).withdrawEarnings());
 assert.equal(await hub.earnings(c),0n);
 await tx(hub.closeChallenge(segmentId));
 assert.equal((await opOf(hub,c)).accepted,1n);
 assert.equal((await hub.workOf(1)).accepted,1n);
 pass('gate 2: SIM trajectory, Journal archiveHash, lockSeed, opening required, pay after window');

 const fedState=applyJournalInputs(trajectory.finalState,[{kind:0,intensity:800}]);
 const fedTraj=await runTrajectory(graph,fedState,{steps:10,checkpointEvery:10,leafEvery:10});
 assert.notEqual(fedTraj.startRoot, packed.commitment.finalRoot);
 const fedId=keccak256(toUtf8Bytes('seg-fed-inputs'));
 const fedPacked=fromTrajectory(fedTraj,{chainId:31337,hub:hubAddr,tokenId:1,segmentId:fedId});
 const fedEpoch=await soul.controlEpoch(1);
 await tx(journal.connect(runner).submitStimulus(1,fedEpoch,0,800,0));
 await tx(hub.connect(runner).openSegment(fedId,1,10,packed.commitment.finalRoot));
 assert.equal((await hub.segments(fedId)).startRoot, packed.commitment.finalRoot);
 const fedPrev=(await journal.heads(1)).checkpointRoot;
 await tx(journal.connect(runner).checkpoint(1,fedEpoch,fedPrev,1,fedPacked.commitment.finalRoot,fedPacked.archiveHash,'ipfs://segment/fed'));
 await tx(hub.connect(runner).commitPrivate(fedId,fedPacked.commitment,fedEpoch,fedPrev,'ipfs://segment/fed'));
 assert.equal((await hub.segments(fedId)).status,2n);
 await increase(24*60*60+1);
 await tx(hub.closeChallenge(fedId));
 assert.equal((await hub.segments(fedId)).status,6n);
 await claimIf(hub,owner);
 pass('inputs change work startRoot; open still uses parent finalRoot for continuity');

 const continued=await runTrajectory(graph,trajectory.finalState,{steps:10,checkpointEvery:10,leafEvery:10});
 assert.equal(continued.startRoot, packed.commitment.finalRoot);
 const inflight=keccak256(toUtf8Bytes('seg-inflight'));
 const fuelBeforeOpen=await tankOf(hub,1);
 await tx(hub.connect(runner).openSegment(inflight,1,10,continued.startRoot));
 const opened=await hub.segments(inflight);
 assert.equal(opened.funder.toLowerCase(), a.toLowerCase());
 await tx(soul.transferFrom(a,b,1));
 await tx(hub.syncOwner(1));
 const afterSync=await tankOf(hub,1);
 assert.equal(afterSync.owner,b);
 assert.equal(afterSync.runner,'0x0000000000000000000000000000000000000000');
 assert.equal(afterSync.ownerFuel,0n);
 assert.equal(afterSync.giftFuel,fuelBeforeOpen.giftFuel);
 assert.equal(afterSync.reserved,opened.fee);
 await tx(hub.connect(other).voidSegment(inflight));
 assert.equal((await hub.segments(inflight)).status,6n);
 assert.equal(await hub.refunds(a), fuelBeforeOpen.ownerFuel);
 await tx(hub.claimRefund());
 assert.equal(await hub.refunds(a),0n);
 await rejectTx(hub.claimRefund());
 await tx(soul.connect(other).setRunner(1,c));
 await tx(hub.connect(other).bindRunner(1,c,fee,10,spendCap,0));
 await tx(hub.setPaused(true));
 await rejectTx(hub.connect(other).refuel(1,parseEther('1')));
 await rejectTx(hub.connect(other).giftFuel(1,parseEther('1')));
 await rejectTx(hub.connect(runner).openSegment(keccak256(toUtf8Bytes('seg-paused')),1,10,packed.commitment.startRoot));
 await tx(hub.setPaused(false));
 await tx(hub.connect(other).refuel(1,parseEther('20')));
 const drainAmt=parseEther('1');
 const fuelMid=(await tankOf(hub,1)).ownerFuel;
 await tx(hub.connect(other).drainOwnerFuel(1,drainAmt));
 assert.equal((await tankOf(hub,1)).ownerFuel,fuelMid-drainAmt);
 pass('gate 3: in-flight reserved refunds to original funder after transfer; pause blocks new fuel and open');

 const voidId=keccak256(toUtf8Bytes('seg-void'));
 await rejectTx(hub.connect(runner).openSegment(voidId,1,10,packed.commitment.startRoot));
 await tx(hub.connect(runner).openSegment(voidId,1,10,continued.startRoot));
 await tx(hub.connect(other).voidSegment(voidId));
 assert.equal((await hub.segments(voidId)).status,6n);
 assert.equal(await hub.activeLease(1), '0x0000000000000000000000000000000000000000000000000000000000000000');
 await claimIf(hub,other);
 await tx(hub.connect(other).refuel(1,parseEther('5')));

 const sameWork=keccak256(toUtf8Bytes('seg-dup-work'));
 await tx(hub.connect(runner).openSegment(sameWork,1,10,continued.startRoot));
 await rejectTx(hub.connect(runner).openSegment(keccak256(toUtf8Bytes('seg-lease')),1,10,continued.startRoot));
 await tx(hub.connect(other).voidSegment(sameWork));
 await claimIf(hub,other);
 await tx(hub.connect(other).refuel(1,parseEther('5')));

 const noOpenId=keccak256(toUtf8Bytes('seg-no-opening'));
 await commitSegment({hub,journal,soul,runner,tokenId:1,segmentId:noOpenId,trajectory:continued,uri:'ipfs://segment/no-opening'});
 await mine(3);
 await tx(hub.lockSeed(noOpenId));
 await increase(24*60*60+1);
 await rejectTx(hub.connect(runner).settlePrivate(noOpenId));
 await tx(hub.closeChallenge(noOpenId));
 assert.equal((await hub.segments(noOpenId)).status,6n);
 await claimIf(hub,other);
 await tx(hub.connect(other).refuel(1,parseEther('5')));

 const timeoutId=keccak256(toUtf8Bytes('seg-dispute-timeout'));
 await commitSegment({hub,journal,soul,runner,tokenId:1,segmentId:timeoutId,trajectory:continued,uri:'ipfs://segment/timeout'});
 await tx(hub.connect(challenger).openDispute(timeoutId));
 assert.equal((await hub.segments(timeoutId)).status,3n);
 await rejectTx(hub.timeoutDispute(timeoutId));
 await increase(24*60*60+1);
 const hiveBefore=await tax.balanceOf(hive);
 const runnerBondBefore=(await opOf(hub,c)).bond;
 await tx(hub.timeoutDispute(timeoutId));
 const slashed=await hub.segments(timeoutId);
 assert.equal(slashed.status,5n);
 assert.equal((await opOf(hub,c)).lost,1n);
 assert.equal((await opOf(hub,c)).bond,runnerBondBefore-fee*5n);
 assert.equal(await tax.balanceOf(hive)>hiveBefore,true);
 assert.equal((await tankOf(hub,1)).reserved,0n);
 await claimIf(hub,other);
 await tx(hub.connect(other).refuel(1,parseEther('5')));
 await tx(hub.connect(runner).topUpBond(parseEther('20')));

 const confirmId=keccak256(toUtf8Bytes('seg-dispute-confirm'));
 await commitSegment({hub,journal,soul,runner,tokenId:1,segmentId:confirmId,trajectory:continued,uri:'ipfs://segment/confirm'});
 await mine(3);
 await tx(hub.lockSeed(confirmId));
 await tx(hub.connect(challenger).openDispute(confirmId));
 const record=adjudicationRecordHash({schema:'iff.adjudication/1',audit:'SIM',verdict:'A',position:10});
 await tx(hub.connect(runner).submitVerdict(confirmId,1,record));
 await tx(hub.connect(challenger).submitVerdict(confirmId,1,record));
 await tx(hub.confirmVerdict(confirmId));
 assert.equal((await hub.segments(confirmId)).status,5n);
 assert.equal((await opOf(hub,c)).lost,2n);
 assert.equal((await hub.workOf(1)).slashed>=1n,true);
 await claimIf(hub,other);
 await tx(hub.connect(other).refuel(1,parseEther('5')));
 await tx(hub.connect(runner).topUpBond(parseEther('20')));

 const mismatchId=keccak256(toUtf8Bytes('seg-mismatch'));
 await commitSegment({hub,journal,soul,runner,tokenId:1,segmentId:mismatchId,trajectory:continued,uri:'ipfs://segment/mismatch'});
 await tx(hub.connect(challenger).openDispute(mismatchId));
 const recA=adjudicationRecordHash({schema:'iff.adjudication/1',audit:'SIM',verdict:'A'});
 const recB=adjudicationRecordHash({schema:'iff.adjudication/1',audit:'SIM',verdict:'B'});
 await tx(hub.connect(runner).submitVerdict(mismatchId,0,recA));
 await tx(hub.connect(challenger).submitVerdict(mismatchId,1,recB));
 await rejectTx(hub.confirmVerdict(mismatchId));
 await increase(24*60*60+1);
 await tx(hub.timeoutDispute(mismatchId));
 assert.equal((await hub.segments(mismatchId)).status,5n);
 assert.equal((await opOf(hub,c)).lost,3n);
 assert.equal((await opOf(hub,d)).lost>=1n,true);
 pass('gate 4: void/lease/no-opening; timeout slashes no-show; matching hashes slash; mismatch times out as neither');

 await tx(hub.setSpendLimits(1,1));
 await rejectTx(hub.connect(runner).openSegment(keccak256(toUtf8Bytes('seg-daycap')),1,10,continued.startRoot));
 await tx(hub.setSpendLimits(0,0));
 const expiredAt=1n;
 await rejectTx(hub.connect(other).bindRunner(1,c,fee,10,spendCap,expiredAt));
 const now=(await provider.getBlock('latest')).timestamp;
 await tx(hub.connect(other).bindRunner(1,c,fee,10,spendCap,now+60));
 await increase(61);
 await rejectTx(hub.connect(runner).openSegment(keccak256(toUtf8Bytes('seg-expired')),1,10,continued.startRoot));
 await tx(hub.connect(other).bindRunner(1,c,fee,10,spendCap,0));
 const firstId=keccak256(toUtf8Bytes('seg-private-1'));
 await tx(hub.revokeAcceptance(firstId));
 assert.equal(await hub.revoked(firstId),true);
 assert.equal(await hub.lastFinalRoot(1), packed.commitment.startRoot);
 await rejectTx(hub.connect(runner).openSegment(keccak256(toUtf8Bytes('seg-revoked-head')),1,10,packed.commitment.finalRoot));
 pass('daily cap, order expiry, and revokeAcceptance roll the payable head back to the parent');

  await provider.send('anvil_setChainId',[56]);
 await rejectTx(new ContractFactory(artifacts.MiningHub.abi,artifacts.MiningHub.bytecode,owner).deploy(soulAddr,journalAddr,taxAddr,hive));
 pass('chainId 56 constructor rejects non-mainnet IFS/hive');

 console.log('OK '+checks.length+' mining hub gates');
}catch(err){
  console.error(err);
  process.exitCode=1;
}finally{
  child.kill();
}
