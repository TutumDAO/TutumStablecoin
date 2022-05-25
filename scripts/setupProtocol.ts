import { Signer } from 'redspot/types/provider';
import {
  deployOracle,
  deployCollateralMock,
  deployMeasurer,
  deployShareToken,
  setupStableCoinContract,
  deployShareProfitController,
  setupVaultContract,
  setupSharesProfitControllerContract,
} from './setupContracts';
import { CONSTS, DEFAULTS } from './constants';
import { fromSigner } from './helpers';

const INIT_AZERO_USD_PRICE_E6 = 1200000;
export async function deploySystem(
  owner: Signer,
  shareTokenName?: string | undefined,
  shareTokenSymbol?: string | undefined,
  shareTokenDecimals?: number | undefined,
  stableTokenName?: string | undefined,
  stableTokenSymbol?: string | undefined,
  stableokenDecimals?: number | undefined,
  maximumMinimumCollateralCoefficientE6?: number | bigint | undefined,
  collateralStepValueE6?: number | bigint | undefined,
  interestRateStepValueE12?: number | bigint | undefined
) {
  console.log(`delpoying with: ${owner.address}`);
  const { contract: oracleContract } = await deployOracle(owner.address);
  await fromSigner(oracleContract, owner.address).tx.feedAzeroUsdPriceE6(INIT_AZERO_USD_PRICE_E6);
  const { contract: measurerContract } = await deployMeasurer(oracleContract.address.toString(), owner.address);
  const { contract: sharesContract } = await deployShareToken(shareTokenName, shareTokenSymbol, shareTokenDecimals, owner.address);
  const stableSetupResults = await setupStableCoinContract(
    stableTokenName,
    stableTokenSymbol,
    stableokenDecimals,
    measurerContract,
    sharesContract,
    owner.address
  );
  const { contract: stableCoinContract } = stableSetupResults.stableCoin;
  const { contract: stableControllerContract } = stableSetupResults.stableController;

  const { contract: sharesProfitControllerContract } = await setupSharesProfitControllerContract(stableCoinContract, owner.address);

  const { contract: collateralTokenContract } = await deployCollateralMock(DEFAULTS.COLLATERAL_DECIMALS, owner.address);

  const vaultSetupResults = await setupVaultContract(
    oracleContract,
    measurerContract,
    sharesProfitControllerContract,
    sharesContract,
    collateralTokenContract,
    stableCoinContract,
    maximumMinimumCollateralCoefficientE6,
    collateralStepValueE6,
    interestRateStepValueE12,
    owner.address
  );

  const { contract: vaultContract } = vaultSetupResults.vault;
  const { contract: vaultControllerContract } = vaultSetupResults.vaultController;

  return {
    oracleContract,
    measurerContract,
    sharesContract,
    sharesProfitControllerContract,
    stableCoinContract,
    stableControllerContract,
    collateralTokenContract,
    vaultContract,
    vaultControllerContract,
  };
}
