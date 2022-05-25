// here vault functinoalites are tested
// while all other contract parameters stay static

import { network } from 'redspot';
import { expect, fromSigner, setupContract } from '../../scripts/helpers';
import { DEFAULTS, ROLES } from '../../scripts/constants';
import { Signer } from 'redspot/types';
import Contract from '@redspot/patract/contract';
import { deploySystem } from '../../scripts/setupProtocol';
import { mintDummyAndApprove } from '../helpers/contractHelpers';
import { randomNumber, randomBigInt } from '../helpers/math';
const { getSigners, api } = network;

const E6: bigint = 1000000n;
const STA_DEC: bigint = E6;
const COL_DEC: bigint = E6 * E6;

const MINIMUM_COLLATERAL_COEFICIENT_E6: bigint = DEFAULTS.MINIMUM_COLLATERAL_COEFICIENT_E6;

describe('Vault', () => {
  let users: Signer[];
  let owner: Signer;
  let oracleContract: Contract;
  let shareTokenAddress: Contract;
  let stableCoinContract: Contract;
  let collateralTokenContract: Contract;
  let measurerContract: Contract;
  let vaultContract: Contract;
  let vaultControllerContract: Contract;

  beforeEach('setup system with DEFAULTS', async () => {
    users = await getSigners();
    owner = users.shift() as Signer;
    const contracts = await deploySystem(owner);
    oracleContract = contracts.oracleContract;
    stableCoinContract = contracts.stableCoinContract;
    collateralTokenContract = contracts.collateralTokenContract;
    measurerContract = contracts.measurerContract;
    vaultContract = contracts.vaultContract;
    vaultControllerContract = contracts.vaultControllerContract;
  });

  describe('single vaults creation and destruction', async () => {
    it('user creates a vault and get a minted nft', async () => {
      await expect(fromSigner(vaultContract, users[0].address).tx.createVault()).to.eventually.be.fulfilled;
      await expect(vaultContract.query.totalSupply()).to.have.output(1);
      await expect(vaultContract.query.ownerOf({ u128: 0 })).to.have.output(users[0].address);
    });

    it('user creates a vault and destroys it', async () => {
      await fromSigner(vaultContract, users[0].address).tx.createVault();
      const id = vaultContract.abi.registry.createType('u128', 0);
      await expect(fromSigner(vaultContract, users[0].address).tx.destroyVault(id)).to.eventually.be.fulfilled;
    });

    it('user fails to destroy a vault if it does not exist', async () => {
      await fromSigner(vaultContract, users[0].address).tx.createVault();
      await expect(fromSigner(vaultContract, users[0].address).tx.destroyVault(1)).to.eventually.be.rejected; //TODO check actual reason or rejectedWith
    });

    it('not a vault owner fails to destroy a vault', async () => {
      await fromSigner(vaultContract, users[0].address).tx.createVault();
      await expect(fromSigner(vaultContract, users[1].address).tx.destroyVault(0)).to.eventually.be.rejected; //TODO check actual reason or rejectedWith
    });
  });

  describe('many vaults creation and destruction', async () => {
    const VAULTS_NUMBER = 20;
    let vaultOwnerId: number[];
    beforeEach('reset', () => {
      vaultOwnerId = [];
    });
    it(' users create vaults and get minted nfts', async () => {
      for (let i = 0; i < VAULTS_NUMBER; i++) {
        vaultOwnerId.push(randomNumber(5));
        await expect(fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.createVault()).to.eventually.be.fulfilled;
        await expect(vaultContract.query.totalSupply()).to.have.output(i + 1);
      }
      for (let i = 0; i < VAULTS_NUMBER; i++) {
        await expect(vaultContract.query.ownerOf({ u128: i })).to.have.output(users[vaultOwnerId[i]].address);
      }
    });

    it('users creates a vault and destroys it', async () => {
      for (let i = 0; i < VAULTS_NUMBER; i++) {
        vaultOwnerId.push(randomNumber(5));
        await expect(fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.createVault()).to.eventually.be.fulfilled;
      }
      for (let i = 0; i < VAULTS_NUMBER; i++) {
        const id = vaultContract.abi.registry.createType('u128', i);
        await expect(fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.destroyVault(id)).to.eventually.be.fulfilled;
      }
    });
  });

  describe('collateral actions', async () => {
    const VAULTS_NUMBER = 20;
    let vaultOwnerId: number[];
    const MINTED_AMOUNT: bigint = randomBigInt(BigInt('9914314313514311311412321412')) + 1n;
    const AZERO_USD_PRICE: bigint = randomBigInt(100000n) + 1000n;
    beforeEach('create vault', async () => {
      vaultOwnerId = [];
      await fromSigner(oracleContract, owner.address).tx.feedAzeroUsdPriceE6(AZERO_USD_PRICE);

      for (let i = 0; i < VAULTS_NUMBER; i++) {
        vaultOwnerId.push(randomNumber(5));
        await fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.createVault();
      }

      for (let i = 0; i < 5; i++) {
        await mintDummyAndApprove(collateralTokenContract, users[i], MINTED_AMOUNT, vaultContract);
      }
    });

    it('users deposit works', async () => {
      // at each deposit check that user make transfer and vault recives it
      // at the end check that all vault have correct details (deposit, debt)
      let depositAmounts: bigint[] = [];
      let totalDeposit: bigint = 0n;
      for (let i = 0; i < VAULTS_NUMBER; i++) {
        depositAmounts.push(randomBigInt(MINTED_AMOUNT / BigInt(VAULTS_NUMBER)));
        totalDeposit += depositAmounts[i];
        const userBalanceBefore = BigInt(
          (await collateralTokenContract.query.balanceOf(users[vaultOwnerId[i]].address)).output?.toString() as string
        );
        await fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.depositCollateral(i, depositAmounts[i]);
        await expect(collateralTokenContract.query.balanceOf(users[vaultOwnerId[i]].address)).to.have.output(
          (userBalanceBefore - depositAmounts[i]).toString()
        );
        await expect(collateralTokenContract.query.balanceOf(vaultContract.address)).to.have.output(totalDeposit);
      }

      for (let i = 0; i < VAULTS_NUMBER; i++) {
        await expect(vaultContract.query.getVaultDetails(i)).to.have.output([depositAmounts[i], 0]);
      }
    });

    it('deposit fails if not enough balace', async () => {
      const depositAmount = MINTED_AMOUNT + 1n;
      await expect(fromSigner(vaultContract, users[0].address).tx.depositCollateral(0, depositAmount)).to.eventually.be.rejected;
    });

    it('non_empty vault can not be destoryed', async () => {
      const depositAmount = 1;
      await fromSigner(vaultContract, users[vaultOwnerId[0]].address).tx.depositCollateral(0, depositAmount);
      await expect(fromSigner(vaultContract, users[0].address).tx.destroyVault(0)).to.eventually.be.rejected;
    });

    it('users withdraw part of collateral, works', async () => {
      // at each withdraw check that user recives transfer
      // at the end check that all vault have correct details (deposit, debt)
      let depositAmounts: bigint[] = [];
      let totalDeposit: bigint = 0n;
      let withdrawAmounts: bigint[] = [];
      let totalWithdraw: bigint = 0n;
      for (let i = 0; i < VAULTS_NUMBER; i++) {
        depositAmounts.push(randomBigInt(MINTED_AMOUNT / BigInt(VAULTS_NUMBER)));
        totalDeposit += depositAmounts[i];
        await fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.depositCollateral(i, depositAmounts[i]);
      }

      for (let i = 0; i < VAULTS_NUMBER; i++) {
        const userBalanceBefore = BigInt(
          (await collateralTokenContract.query.balanceOf(users[vaultOwnerId[i]].address)).output?.toString() as string
        );
        withdrawAmounts.push(randomBigInt(depositAmounts[i]));
        totalWithdraw += withdrawAmounts[i];
        await fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.withdrawCollateral(i, withdrawAmounts[i]);
        await expect(collateralTokenContract.query.balanceOf(users[vaultOwnerId[i]].address)).to.have.output(
          userBalanceBefore + withdrawAmounts[i]
        );
        await expect(collateralTokenContract.query.balanceOf(vaultContract.address)).to.have.output(totalDeposit - totalWithdraw);
      }

      for (let i = 0; i < VAULTS_NUMBER; i++) {
        await expect(vaultContract.query.getVaultDetails(i)).to.have.output([depositAmounts[i] - withdrawAmounts[i], 0]);
      }
    });

    it('users deposit withdraw and then destroy vaults can be destroyed test', async () => {
      let depositAmounts: bigint[] = [];
      let totalDeposit: bigint = 0n;
      for (let i = 0; i < VAULTS_NUMBER; i++) {
        depositAmounts.push(randomBigInt(MINTED_AMOUNT / BigInt(VAULTS_NUMBER)));
        totalDeposit += depositAmounts[i];
        await fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.depositCollateral(i, depositAmounts[i]);
      }

      for (let i = 0; i < VAULTS_NUMBER; i++) {
        await fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.withdrawCollateral(i, depositAmounts[i]);
      }

      for (let i = 0; i < VAULTS_NUMBER; i++) {
        await expect(fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.destroyVault(i)).to.eventually.be.fulfilled;
      }
    });
  });

  describe('Emiting actions', async () => {
    const VAULTS_NUMBER = 20;
    let vaultOwnerId: number[];
    let depositedAmounts: bigint[];
    const MINTED_AMOUNT: bigint = randomBigInt(BigInt('9914314313514311311412321412'));
    const AZERO_USD_PRICE: bigint = randomBigInt(100000n) + 1000n;
    beforeEach('users create vaults and make deposits', async () => {
      vaultOwnerId = [];
      depositedAmounts = [];

      await fromSigner(oracleContract, owner.address).tx.feedAzeroUsdPriceE6(AZERO_USD_PRICE);
      // make vault MINTER and BURNER of mocked stablecoin

      await fromSigner(stableCoinContract, owner.address).tx.setupRole(ROLES.MINTER, vaultContract.address.toString());
      await fromSigner(stableCoinContract, owner.address).tx.setupRole(ROLES.BURNER, vaultContract.address.toString());
      await fromSigner(stableCoinContract, owner.address).tx.setupRole(ROLES.VAULT, vaultContract.address.toString());

      // mint collateral to users and approve vault to spend
      for (let i = 0; i < 5; i++) {
        await mintDummyAndApprove(collateralTokenContract, users[i], MINTED_AMOUNT, vaultContract);
      }

      //create vaults and make deposits
      for (let i = 0; i < VAULTS_NUMBER; i++) {
        vaultOwnerId.push(randomNumber(5));
        await fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.createVault();
        depositedAmounts.push(randomBigInt(MINTED_AMOUNT / BigInt(VAULTS_NUMBER)));
        await fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.depositCollateral(i, depositedAmounts[i]);
      }
    });

    describe('borrowing', async () => {
      it('get debt ceiling returns correct value', async () => {
        for (let i = 0; i < VAULTS_NUMBER; i++) {
          const debtCeiling = (((depositedAmounts[i] * AZERO_USD_PRICE) / COL_DEC) * STA_DEC) / MINIMUM_COLLATERAL_COEFICIENT_E6;
          await expect(vaultContract.query.getDebtCeiling(i)).to.have.output(debtCeiling);
        }
      });

      it('during borrow stablecoin should be minted and debt should be set', async () => {
        // at each borrow check that user recives mint and that debt is updated
        // at the end check that all vault have correct details (deposit, debt)
        let vaultDebts: bigint[] = [];
        let usersDebts: bigint[] = [0n, 0n, 0n, 0n, 0n];
        let totalDebt: bigint = 0n;
        for (let i = 0; i < VAULTS_NUMBER; i++) {
          const debtCeiling: bigint = BigInt(await BigInt((await vaultContract.query.getDebtCeiling(i)).output?.toString() as string));
          vaultDebts.push(randomBigInt(debtCeiling));
          totalDebt += vaultDebts[i];

          await expect(stableCoinContract.query.balanceOf(users[vaultOwnerId[i]].address)).to.have.output(usersDebts[vaultOwnerId[i]]);
          await expect(fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.borrowToken(i, vaultDebts[i])).to.eventually.be
            .fulfilled;
          usersDebts[vaultOwnerId[i]] += vaultDebts[i];
          await expect(stableCoinContract.query.balanceOf(users[vaultOwnerId[i]].address)).to.have.output(usersDebts[vaultOwnerId[i]]);
          await expect(stableCoinContract.query.accountDebt(users[vaultOwnerId[i]].address)).to.have.output(usersDebts[vaultOwnerId[i]]);
        }

        for (let i = 0; i < VAULTS_NUMBER; i++) {
          await expect(vaultContract.query.getVaultDetails(i)).to.have.output([depositedAmounts[i], vaultDebts[i]]);
        }
      });

      it('borrow should work for debt ceiling', async () => {
        for (let i = 0; i < VAULTS_NUMBER; i++) {
          const debtCeiling: bigint = BigInt(await BigInt((await vaultContract.query.getDebtCeiling(i)).output?.toString() as string));
          await expect(fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.borrowToken(i, debtCeiling)).to.eventually.be.fulfilled;
        }
      });
    });

    describe('pay back', async () => {
      let vaultDebts: bigint[] = [];
      let usersDebts: bigint[] = [0n, 0n, 0n, 0n, 0n];
      let totalDebt: bigint = 0n;
      beforeEach('', async () => {
        for (let i = 0; i < VAULTS_NUMBER; i++) {
          const debtCeiling: bigint = BigInt(await BigInt((await vaultContract.query.getDebtCeiling(i)).output?.toString() as string));
          vaultDebts.push(randomBigInt(debtCeiling));
          totalDebt += vaultDebts[i];
          await fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.borrowToken(i, vaultDebts[i]);
          usersDebts[vaultOwnerId[i]] += vaultDebts[i];
        }
      });
      it('users pay part of their debts', async () => {
        let vaultPayBacked: bigint[] = [];
        let userPayBacked: bigint[] = [0n, 0n, 0n, 0n, 0n];
        for (let i = 0; i < VAULTS_NUMBER; i++) {
          vaultPayBacked.push(randomBigInt(vaultDebts[i]));
          const userBalanceBefore = BigInt(
            (await stableCoinContract.query.balanceOf(users[vaultOwnerId[i]].address)).output?.toString() as string
          );
          await fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.payBackToken(i, vaultPayBacked[i]);
          await expect(stableCoinContract.query.balanceOf(users[vaultOwnerId[i]].address)).to.have.output(
            userBalanceBefore - vaultPayBacked[i]
          );
          userPayBacked[vaultOwnerId[i]] += vaultPayBacked[i];
          totalDebt -= vaultPayBacked[i];
          await expect(stableCoinContract.query.accountDebt(users[vaultOwnerId[i]].address)).to.have.output(
            usersDebts[vaultOwnerId[i]] - userPayBacked[vaultOwnerId[i]]
          );
        }
        for (let i = 0; i < VAULTS_NUMBER; i++) {
          await expect(vaultContract.query.getVaultDetails(i)).to.have.output([depositedAmounts[i], vaultDebts[i] - vaultPayBacked[i]]);
        }
      });
    });
  });
});
