import { ContractFactory } from "ethers";

export async function deployRenderer(artifacts, signer) {
  const renderer = await new ContractFactory(
    artifacts.SoulRenderer.abi,
    artifacts.SoulRenderer.bytecode,
    signer,
  ).deploy();
  await renderer.waitForDeployment();
  return renderer;
}

export async function deploySoul(artifacts, signer, genesis, uri, rendererAddress) {
  const soul = await new ContractFactory(
    artifacts.ImmortalSoul.abi,
    artifacts.ImmortalSoul.bytecode,
    signer,
  ).deploy(
    genesis.genesisRoot,
    genesis.speciesHash,
    genesis.modelHash,
    uri,
    rendererAddress,
  );
  await soul.waitForDeployment();
  return soul;
}

export async function deploySoulCollection(artifacts, signer, genesis, uri) {
  const renderer = await deployRenderer(artifacts, signer);
  const soul = await deploySoul(
    artifacts,
    signer,
    genesis,
    uri,
    await renderer.getAddress(),
  );
  return { soul, renderer };
}
