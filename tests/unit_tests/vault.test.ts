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
import { deployEmmitedToken } from '../../scripts/setupContracts';
const { getSigners, api } = network;

const E6: bigint = 1000000n;
const STA_DEC: bigint = E6;
const COL_DEC: bigint = E6 * E6;

const MINIMUM_COLLATERAL_COEFICIENT_E6: bigint = DEFAULTS.MINIMUM_COLLATERAL_COEFICIENT_E6;

describe.only('Vault', () => {
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
      await expect(fromSigner(vaultContract, users[0].address).tx.createVault())
        .to.emit(vaultContract, 'Transfer')
        .withArgs('' as string, users[0].address, 0); //TODO how to pass Option<None>
      await expect(vaultContract.query.totalSupply()).to.have.output(1);
      await expect(vaultContract.query.ownerOf({ u128: 0 })).to.have.output(users[0].address);
    });

    it('user creates a vault and destroys it', async () => {
      await fromSigner(vaultContract, users[0].address).tx.createVault();
      const id = vaultContract.abi.registry.createType('u128', 0);
      await expect(fromSigner(vaultContract, users[0].address).tx.destroyVault(id))
        .to.emit(vaultContract, 'Transfer')
        .withArgs(users[0].address, '', 0); //TODO how to pass Option<None>
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
    const USER_NUMBER = 4;
    let vaultOwnerId: number[];
    beforeEach('reset', () => {
      vaultOwnerId = [];
    });
    it(' users create vaults and get minted nfts', async () => {
      for (let i = 0; i < VAULTS_NUMBER; i++) {
        vaultOwnerId.push(randomNumber(USER_NUMBER));
        await expect(fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.createVault()).to.eventually.be.fulfilled;
        await expect(vaultContract.query.totalSupply()).to.have.output(i + 1);
      }
      for (let i = 0; i < VAULTS_NUMBER; i++) {
        await expect(vaultContract.query.ownerOf({ u128: i })).to.have.output(users[vaultOwnerId[i]].address);
      }
    });

    it('users creates a vault and destroys it', async () => {
      for (let i = 0; i < VAULTS_NUMBER; i++) {
        vaultOwnerId.push(randomNumber(USER_NUMBER));
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
    const USER_NUMBER = 4;
    let vaultOwnerId: number[];
    const MINTED_AMOUNT: bigint = randomBigInt(BigInt('9914314313514311311412321412')) + 1n;
    const AZERO_USD_PRICE: bigint = randomBigInt(100000n) + 1000n;
    beforeEach('create vault', async () => {
      vaultOwnerId = [];
      await fromSigner(oracleContract, owner.address).tx.feedAzeroUsdPriceE6(AZERO_USD_PRICE);

      for (let i = 0; i < VAULTS_NUMBER; i++) {
        vaultOwnerId.push(randomNumber(USER_NUMBER));
        await fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.createVault();
      }

      for (let i = 0; i < USER_NUMBER; i++) {
        await mintDummyAndApprove(collateralTokenContract, users[i], MINTED_AMOUNT, vaultContract);
      }
    });

    it('deposits emit a Deposit event', async () => {
      let totalDeposit: bigint = 0n;
      for (let i = 0; i < 10; i++) {
        const toDeposit = randomBigInt(MINTED_AMOUNT / BigInt(VAULTS_NUMBER));
        totalDeposit += toDeposit;
        await expect(fromSigner(vaultContract, users[vaultOwnerId[0]].address).tx.depositCollateral(0, toDeposit))
          .to.emit(vaultContract, 'Deposit')
          .withArgs(0, totalDeposit); //TODO how to pass Option<None>
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

    it('withdraws emit a Withdraw event', async () => {
      let totalDeposit = MINTED_AMOUNT;
      await fromSigner(vaultContract, users[vaultOwnerId[0]].address).tx.depositCollateral(0, totalDeposit);

      for (let i = 0; i < 10; i++) {
        const toWithdraw = randomBigInt(MINTED_AMOUNT / BigInt(totalDeposit));
        totalDeposit -= toWithdraw;
        await expect(fromSigner(vaultContract, users[vaultOwnerId[0]].address).tx.withdrawCollateral(0, toWithdraw))
          .to.emit(vaultContract, 'Withdraw')
          .withArgs(0, totalDeposit); //TODO how to pass Option<None>
      }
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
    const USER_NUMBER = 4;
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
      for (let i = 0; i < USER_NUMBER; i++) {
        await mintDummyAndApprove(collateralTokenContract, users[i], MINTED_AMOUNT, vaultContract);
      }

      //create vaults and make deposits
      for (let i = 0; i < VAULTS_NUMBER; i++) {
        vaultOwnerId.push(randomNumber(USER_NUMBER));
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

      it('during borrow stablecoin should be minted, debt should be set and Borrow event shoud be emited', async () => {
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
          await expect(fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.borrowToken(i, vaultDebts[i]))
            .to.emit(vaultContract, 'Borrow')
            .withArgs(i, vaultDebts[i]);
          usersDebts[vaultOwnerId[i]] += vaultDebts[i];
          await expect(stableCoinContract.query.balanceOf(users[vaultOwnerId[i]].address)).to.have.output(usersDebts[vaultOwnerId[i]]);
          await expect(stableCoinContract.query.accountDebt(users[vaultOwnerId[i]].address)).to.have.output(usersDebts[vaultOwnerId[i]]);
        }

        for (let i = 0; i < VAULTS_NUMBER; i++) {
          await expect(vaultContract.query.getVaultDetails(i)).to.have.output([depositedAmounts[i], vaultDebts[i]]);
        }
        await expect(stableCoinContract.query.totalSupply()).to.have.output(totalDebt);
      });

      it('borrow should work for debt ceiling', async () => {
        for (let i = 0; i < VAULTS_NUMBER; i++) {
          const debtCeiling: bigint = BigInt(await BigInt((await vaultContract.query.getDebtCeiling(i)).output?.toString() as string));
          await expect(fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.borrowToken(i, debtCeiling)).to.eventually.be.fulfilled;
        }
      });
    });

    describe('pay back', async () => {
      let vaultDebts: bigint[];
      let usersDebts: bigint[];
      let totalDebt: bigint;
      beforeEach('borrow', async () => {
        vaultDebts = [];
        usersDebts = [0n, 0n, 0n, 0n, 0n];
        totalDebt = 0n;
        for (let i = 0; i < VAULTS_NUMBER; i++) {
          const debtCeiling: bigint = BigInt(await BigInt((await vaultContract.query.getDebtCeiling(i)).output?.toString() as string));
          vaultDebts.push(randomBigInt(debtCeiling));
          await fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.borrowToken(i, vaultDebts[i]);
          usersDebts[vaultOwnerId[i]] += vaultDebts[i];
          totalDebt += vaultDebts[i];
        }
      });
      it('users pay part of their debts, the stablecoin is burned, debt is updated, PayBack event is emitted', async () => {
        let vaultPayBacked: bigint[] = [];
        let userPayBacked: bigint[] = [0n, 0n, 0n, 0n, 0n];
        for (let i = 0; i < VAULTS_NUMBER; i++) {
          vaultPayBacked.push(randomBigInt(vaultDebts[i]));
          const userBalanceBefore = BigInt(
            (await stableCoinContract.query.balanceOf(users[vaultOwnerId[i]].address)).output?.toString() as string
          );
          await expect(fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.payBackToken(i, vaultPayBacked[i]))
            .to.emit(vaultContract, 'PayBack')
            .withArgs(i, vaultDebts[i] - vaultPayBacked[i]);
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
        await expect(stableCoinContract.query.totalSupply()).to.have.output(totalDebt);
      });

      it('users pay back all of their debts', async () => {
        let vaultPayBacked: bigint[] = [];
        let userPayBacked: bigint[] = [0n, 0n, 0n, 0n, 0n];
        for (let i = 0; i < VAULTS_NUMBER; i++) {
          vaultPayBacked.push(vaultDebts[i]);
          const userBalanceBefore = BigInt(
            (await stableCoinContract.query.balanceOf(users[vaultOwnerId[i]].address)).output?.toString() as string
          );
          await expect(fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.payBackToken(i, vaultPayBacked[i]))
            .to.emit(vaultContract, 'PayBack')
            .withArgs(i, 0);
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
          await expect(vaultContract.query.getVaultDetails(i)).to.have.output([depositedAmounts[i], 0]);
        }
        await expect(stableCoinContract.query.totalSupply()).to.have.output(totalDebt);
      });
    });

    describe('buy risky vault and prepare liquidator', async () => {
      let liquidator: Signer;
      let vaultDebts: bigint[];
      let usersDebts: bigint[];
      let liquidatorCollateral: bigint = 99999999999999999999999999999999n;
      let liquidatorDebt: bigint;
      beforeEach('change azero price', async () => {
        vaultDebts = [];
        usersDebts = [0n, 0n, 0n, 0n, 0n];

        // take more then 50% of possible debt
        for (let i = 0; i < VAULTS_NUMBER; i++) {
          const debtCeiling: bigint = BigInt(await BigInt((await vaultContract.query.getDebtCeiling(i)).output?.toString() as string));
          vaultDebts.push(randomBigInt(debtCeiling / 2n) + debtCeiling / 2n);
          await fromSigner(vaultContract, users[vaultOwnerId[i]].address).tx.borrowToken(i, vaultDebts[i]);
          usersDebts[vaultOwnerId[i]] += vaultDebts[i];
        }
        // setup liquidator
        liquidator = users[USER_NUMBER];
        await mintDummyAndApprove(collateralTokenContract, liquidator, liquidatorCollateral, vaultContract);
        await fromSigner(vaultContract, liquidator.address).tx.createVault();
        await fromSigner(vaultContract, liquidator.address).tx.depositCollateral(VAULTS_NUMBER, liquidatorCollateral);
        liquidatorDebt = BigInt((await (await vaultContract.query.getDebtCeiling(VAULTS_NUMBER)).output?.toString()) as string);
        await fromSigner(vaultContract, liquidator.address).tx.borrowToken(VAULTS_NUMBER, liquidatorDebt);

        //change oracle price by factor 2
        await fromSigner(oracleContract, owner.address).tx.feedAzeroUsdPriceE6(AZERO_USD_PRICE / 2n); // maximum debt should be 2 times smaller now
      });

      for (let reps = 0; reps < 3; reps++) {
        it('get debt ceiling returns correct value after price update', async () => {
          for (let i = 0; i < VAULTS_NUMBER; i++) {
            const debtCeilingBefore = (((depositedAmounts[i] * AZERO_USD_PRICE) / COL_DEC) * STA_DEC) / MINIMUM_COLLATERAL_COEFICIENT_E6;
            const debtCeilingAfter = debtCeilingBefore / 2n;
            await expect(vaultContract.query.getDebtCeiling(i)).to.have.output(debtCeilingAfter);
          }
        });
      }

      it('non liquidator can not liquidate vault', async () => {
        await fromSigner(vaultContract, owner.address).tx.setLiquidatorAddress(liquidator.address);
        await fromSigner(stableCoinContract, liquidator.address).tx.transfer(owner.address, liquidatorDebt, '');
        const debtCeiling = BigInt((await (await vaultContract.query.getDebtCeiling(0)).output?.toString()) as string);
        expect(debtCeiling < vaultDebts[0]);
        expect(fromSigner(vaultContract, owner.address).tx.buyRiskyVault(0)).to.eventually.be.rejected;
      });

      it('before setting liquidator, anyone can buy risky vaults', async () => {
        // liauidator_address wasnt set in vaultContract so luqidator is jsut some address.
        console.log((await vaultContract.query.getLiquidatorAddress()).output?.toString());
        for (let i = 0; i < VAULTS_NUMBER; i++) {
          const liquidatorBalanceBefore = BigInt(
            (await stableCoinContract.query.balanceOf(liquidator.address)).output?.toString() as string
          );
          await expect(fromSigner(vaultContract, liquidator.address).tx.buyRiskyVault(i)).to.eventually.be.fulfilled;
          await expect(vaultContract.query.ownerOf({ u128: i })).to.have.output(liquidator.address);
          await expect(vaultContract.query.getVaultDetails(i)).to.have.output([depositedAmounts[i], 0]);
          await expect(stableCoinContract.query.balanceOf(liquidator.address)).to.have.output(liquidatorBalanceBefore - vaultDebts[i]);
        }
        await expect(vaultContract.query.getTotalDebt()).to.have.output(liquidatorDebt);
      });

      it('after settin liquidator, liquidator buys risky vaults', async () => {
        await fromSigner(vaultContract, owner.address).tx.setLiquidatorAddress(liquidator.address);
        for (let i = 0; i < VAULTS_NUMBER; i++) {
          const liquidatorBalanceBefore = BigInt(
            (await stableCoinContract.query.balanceOf(liquidator.address)).output?.toString() as string
          );
          await expect(fromSigner(vaultContract, liquidator.address).tx.buyRiskyVault(i)).to.eventually.be.fulfilled;
          await expect(vaultContract.query.ownerOf({ u128: i })).to.have.output(liquidator.address);
          await expect(vaultContract.query.getVaultDetails(i)).to.have.output([depositedAmounts[i], 0]);
          await expect(stableCoinContract.query.balanceOf(liquidator.address)).to.have.output(liquidatorBalanceBefore - vaultDebts[i]);
        }
        await expect(vaultContract.query.getTotalDebt()).to.have.output(liquidatorDebt);
      });
    });
  });

  describe('before recieved', async () => {
    let somePSP22Contract: Contract;
    const MINTED_AMOUNT = randomBigInt(10000000000000000000n);
    beforeEach('create other PSP22 token', async () => {
      somePSP22Contract = (await deployEmmitedToken(undefined, owner.address)).contract;
      await mintDummyAndApprove(somePSP22Contract, users[1], MINTED_AMOUNT, vaultContract);
    });

    it('transfering not collateral PSP22 to vault should fail', async () => {
      const amount = randomBigInt(MINTED_AMOUNT);
      expect(fromSigner(somePSP22Contract, users[1].address).tx.transfer(vaultContract.address, amount)).to.be.eventually.rejected;
    });
  });

  describe('setters', async () => {
    it('owner sets new oracle, vault_controller_address, liquidator_address', async () => {
      expect(fromSigner(vaultContract, owner.address).tx.setOracleAddress(users[0].address)).to.be.eventually.fulfilled;
      expect(vaultContract.query.getOracleAddress()).to.have.output(users[0].address);
      expect(fromSigner(vaultContract, owner.address).tx.setVaultControllerAddress(users[1].address)).to.be.eventually.fulfilled;
      expect(vaultContract.query.getVaultControllerAddress()).to.have.output(users[1].address);
      expect(fromSigner(vaultContract, owner.address).tx.setLiquidatorAddress(users[2].address)).to.be.eventually.fulfilled;
      expect(vaultContract.query.getLiquidatorAddress()).to.have.output(users[2].address);
      expect(fromSigner(vaultContract, owner.address).tx.setLiquidatorAddress(null)).to.be.eventually.fulfilled;
      expect(vaultContract.query.getLiquidatorAddress()).to.have.output(null);
    });
    it('non owner tries to set new oracle, vault_controller_address, liquidator_address fails', async () => {
      expect(fromSigner(vaultContract, users[0].address).tx.setOracleAddress(users[1].address)).to.be.eventually.rejected;
      expect(fromSigner(vaultContract, users[0].address).tx.setVaultControllerAddress(users[2].address)).to.be.eventually.rejected;
      expect(fromSigner(vaultContract, users[0].address).tx.setLiquidatorAddress(users[3].address)).to.be.eventually.rejected;
    });
  });
});
