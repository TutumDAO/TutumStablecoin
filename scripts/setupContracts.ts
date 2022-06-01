import { AccountId } from '@polkadot/types/interfaces';
import { expect, fromSigner, setupContract } from './helpers';
import { CONSTS, DEFAULTS, ROLES } from './constants';
import Contract from '@redspot/patract/contract';
import { convertCompilerOptionsFromJson } from 'typescript';

export async function deployMeasurer(oracleAddress: string, owner: string) {
  const ret = await setupContract('measurer_contract', 'new', oracleAddress, owner);
  console.log(`deploy measurer_contract : at ${ret.contract.address.toString()}`);
  return ret;
}

export async function deployOracle(owner: string) {
  const ret = await setupContract('oracle_contract', 'new', owner);
  console.log(`deploy oracle_contract : at ${ret.contract.address.toString()}`);
  return ret;
}

export async function deployEmmitedToken(decimals: number | bigint = DEFAULTS.STABLE_DECIMALS, owner: string) {
  const ret = await setupContract('psp22_emitable_contract', 'new', 'stable_coin', 'description', decimals, owner);
  console.log(`deploy psp22_emitable_contract : at ${ret.contract.address.toString()}`);
  return ret;
}
// profits are in
export async function deployShareProfitController(stable_coin_address: string, owner: string) {
  const ret = await setupContract('shares_profit_controller_contract', 'new', stable_coin_address, owner);
  console.log(`deploy shares_profit_controller_contract : at ${ret.contract.address.toString()}`);
  return ret;
}

export async function deployShareToken(
  name: string = 'Tutum share',
  symbol: string = 'TUM',
  decimals: number | bigint = DEFAULTS.SHARES_DECIMALS,
  owner: string
) {
  const ret = await setupContract('shares_token_contract', 'new', name, symbol, decimals, owner);
  console.log(`deploy shares_token_contract : at ${ret.contract.address.toString()}`);
  return ret;
}

export async function deployStableCoin(
  name: string = 'USD Alpeh',
  symbol: string = 'USDA',
  decimals: number | bigint = DEFAULTS.STABLE_DECIMALS,
  share_token_address: string,
  owner: string
) {
  const ret = await setupContract('stable_coin_new_contract', 'new', name, symbol, decimals, share_token_address, owner);
  console.log(`deploy stable_coin_new_contract : at ${ret.contract.address.toString()}`);
  return ret;
}

export async function deployStableController(measurerAddress: string, stableAddress: string, owner: string) {
  const ret = await setupContract('stable_controller_contract', 'new', measurerAddress, stableAddress, owner);
  console.log(`deploy stable_controller_contract : at ${ret.contract.address.toString()}`);
  return ret;
}

export async function deployCollateralMock(decimals: number | bigint = DEFAULTS.COLLATERAL_DECIMALS, owner: string) {
  const ret = await setupContract('psp22_emitable_contract', 'new', 'emitable_coin', 'sample_description', decimals, owner);
  console.log(`deploy psp22_emitable_contract : at ${ret.contract.address.toString()}`);
  return ret;
}

export async function deployVault(
  oracleAddress: string,
  sharesTokenAddress: string,
  shareProfitControllerContract: string,
  collateralTokenAddress: string,
  stableTokenAddress: string,
  maximumMinimumCollateralCoefficientE6: number | bigint = DEFAULTS.MINIMUM_COLLATERAL_COEFICIENT_E6,
  collateralStepValueE6: number | bigint = DEFAULTS.COLLATERAL_STEP_VALUE_E6,
  interestRateStepValueE12: number | bigint = DEFAULTS.INTEREST_RATE_STEP_VALUE_E12,
  owner: string
) {
  const ret = await setupContract(
    'vault_contract',
    'new',
    oracleAddress,
    sharesTokenAddress,
    shareProfitControllerContract,
    collateralTokenAddress,
    stableTokenAddress,
    maximumMinimumCollateralCoefficientE6,
    collateralStepValueE6,
    interestRateStepValueE12,
    owner
  );
  console.log(`deploy vault_contract : at ${ret.contract.address.toString()}`);
  return ret;
}

export async function deployVaultController(measurer_address: string, vault_address: string, owner: string) {
  const ret = await setupContract('vault_controller_contract', 'new', measurer_address, vault_address, owner);
  console.log(`deploy vault_controller_contract : at ${ret.contract.address.toString()}`);
  return ret;
}

export async function setupStableCoinContract(
  name: string = 'USD Alpeh',
  symbol: string = 'USDA',
  decimals: number | bigint = DEFAULTS.STABLE_DECIMALS,
  measurerContract: Contract,
  sharesContract: Contract,
  owner: string
) {
  console.log('setup_stabe START');
  const stableCoinResults = await deployStableCoin(name, symbol, decimals, sharesContract.address.toString(), owner);
  const stableControllerResults = await deployStableController(
    measurerContract.address.toString(),
    stableCoinResults.contract.address.toString(),
    owner
  );

  await fromSigner(stableCoinResults.contract, owner).tx.setStableControllerAddress(stableControllerResults.contract.address.toString());
  await fromSigner(sharesContract, owner).tx.setupRole(ROLES.MINTER, stableCoinResults.contract.address.toString());
  console.log('setup_stabe END');
  return { stableCoin: stableCoinResults, stableController: stableControllerResults };
}

export async function setupSharesProfitControllerContract(stableCoinContract: Contract, owner: string) {
  console.log('setup_spcontroller START');
  const returns = await deployShareProfitController(stableCoinContract.address.toString(), owner);
  await fromSigner(stableCoinContract, owner).tx.setSharesProfitControllerAddress(returns.contract.address.toString());
  await fromSigner(returns.contract, owner).tx.setIsGenerator(stableCoinContract.address.toString(), true);
  await fromSigner(stableCoinContract, owner).tx.setupRole(ROLES.MINTER, returns.contract.address.toString());
  console.log('setup_spcontroller STOP');

  return returns;
}

export async function setupVaultContract(
  oracleContract: Contract,
  measurerContract: Contract,
  sharesProfitControllerContract: Contract,
  sharesContract: Contract,
  collateralTokenContract: Contract,
  stableCoinContract: Contract,
  maximumMinimumCollateralCoefficientE6: number | bigint = DEFAULTS.MINIMUM_COLLATERAL_COEFICIENT_E6,
  collateralStepValueE6: number | bigint = DEFAULTS.COLLATERAL_STEP_VALUE_E6,
  interestRateStepValueE12: number | bigint = DEFAULTS.INTEREST_RATE_STEP_VALUE_E12,
  owner: string
) {
  console.log('setup_vault START');
  const vaultReturns = await deployVault(
    oracleContract.address.toString(),
    sharesContract.address.toString(),
    sharesProfitControllerContract.address.toString(),
    collateralTokenContract.address.toString(),
    stableCoinContract.address.toString(),
    maximumMinimumCollateralCoefficientE6,
    collateralStepValueE6,
    interestRateStepValueE12,
    owner
  );
  const vaultControllerReturns = await deployVaultController(
    measurerContract.address.toString(),
    vaultReturns.contract.address.toString(),
    owner
  );
  await fromSigner(vaultReturns.contract, owner).tx.setVaultControllerAddress(vaultControllerReturns.contract.address.toString());
  await fromSigner(stableCoinContract, owner).tx.setupRole(ROLES.MINTER, vaultReturns.contract.address.toString());
  await fromSigner(stableCoinContract, owner).tx.setupRole(ROLES.BURNER, vaultReturns.contract.address.toString());
  await fromSigner(stableCoinContract, owner).tx.setupRole(ROLES.VAULT, vaultReturns.contract.address.toString());
  await fromSigner(sharesContract, owner).tx.setupRole(ROLES.MINTER, vaultReturns.contract.address.toString());
  await fromSigner(sharesProfitControllerContract, owner).tx.setIsGenerator(vaultReturns.contract.address.toString(), true);
  console.log('setup_vault END');
  return { vault: vaultReturns, vaultController: vaultControllerReturns };
}
