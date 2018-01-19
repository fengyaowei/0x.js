import { ZeroEx } from '0x.js';
import { BlockchainLifecycle, devConstants, web3Factory } from '@0xproject/dev-utils';
import { BigNumber } from '@0xproject/utils';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import * as chai from 'chai';

import { Artifacts } from '../util/artifacts';
import { constants } from '../util/constants';
import { ContractInstance } from '../util/types';

import { chaiSetup } from './utils/chai_setup';

const { DummyTokenV2 } = new Artifacts(artifacts);
chaiSetup.configure();
const expect = chai.expect;
const web3 = web3Factory.create();
const blockchainLifecycle = new BlockchainLifecycle(devConstants.RPC_URL);

describe('UnlimitedAllowanceTokenV2', () => {
    const web3Wrapper = new Web3Wrapper(web3.currentProvider);
    const config = {
        networkId: constants.TESTRPC_NETWORK_ID,
    };
    const zeroEx = new ZeroEx(web3.currentProvider, config);
    let owner: string;
    let spender: string;

    const MAX_MINT_VALUE = new BigNumber(100000000000000000000);
    let tokenAddress: string;
    let token: ContractInstance;

    before(async () => {
        const accounts = await web3Wrapper.getAvailableAddressesAsync();
        owner = accounts[0];
        spender = accounts[1];
        token = await DummyTokenV2.new({ from: owner });
        await token.mint(MAX_MINT_VALUE, { from: owner });
        tokenAddress = token.address;
    });
    beforeEach(async () => {
        await blockchainLifecycle.startAsync();
    });
    afterEach(async () => {
        await blockchainLifecycle.revertAsync();
    });
    describe('transfer', () => {
        it('should throw if owner has insufficient balance', async () => {
            const ownerBalance = await zeroEx.token.getBalanceAsync(tokenAddress, owner);
            const amountToTransfer = ownerBalance.plus(1);
            return expect(token.transfer.call(spender, amountToTransfer, { from: owner })).to.be.rejectedWith(
                constants.REVERT,
            );
        });

        it('should transfer balance from sender to receiver', async () => {
            const receiver = spender;
            const initOwnerBalance = await zeroEx.token.getBalanceAsync(tokenAddress, owner);
            const amountToTransfer = new BigNumber(1);
            await zeroEx.token.transferAsync(tokenAddress, owner, receiver, amountToTransfer);
            const finalOwnerBalance = await zeroEx.token.getBalanceAsync(tokenAddress, owner);
            const finalReceiverBalance = await zeroEx.token.getBalanceAsync(tokenAddress, receiver);

            const expectedFinalOwnerBalance = initOwnerBalance.minus(amountToTransfer);
            const expectedFinalReceiverBalance = amountToTransfer;
            expect(finalOwnerBalance).to.be.bignumber.equal(expectedFinalOwnerBalance);
            expect(finalReceiverBalance).to.be.bignumber.equal(expectedFinalReceiverBalance);
        });

        it('should return true on a 0 value transfer', async () => {
            const didReturnTrue = await token.transfer.call(spender, 0, {
                from: owner,
            });
            expect(didReturnTrue).to.be.true();
        });
    });

    describe('transferFrom', () => {
        it('should throw if owner has insufficient balance', async () => {
            const ownerBalance = await zeroEx.token.getBalanceAsync(tokenAddress, owner);
            const amountToTransfer = ownerBalance.plus(1);
            await zeroEx.token.setAllowanceAsync(tokenAddress, owner, spender, amountToTransfer);
            return expect(
                token.transferFrom.call(owner, spender, amountToTransfer, {
                    from: spender,
                }),
            ).to.be.rejectedWith(constants.REVERT);
        });

        it('should throw if spender has insufficient allowance', async () => {
            const ownerBalance = await zeroEx.token.getBalanceAsync(tokenAddress, owner);
            const amountToTransfer = ownerBalance;

            const spenderAllowance = await zeroEx.token.getAllowanceAsync(tokenAddress, owner, spender);
            const spenderAllowanceIsInsufficient = spenderAllowance.cmp(amountToTransfer) < 0;
            expect(spenderAllowanceIsInsufficient).to.be.true();

            return expect(
                token.transferFrom.call(owner, spender, amountToTransfer, {
                    from: spender,
                }),
            ).to.be.rejectedWith(constants.REVERT);
        });

        it('should return true on a 0 value transfer', async () => {
            const amountToTransfer = 0;
            const didReturnTrue = await token.transferFrom.call(owner, spender, amountToTransfer, { from: spender });
            expect(didReturnTrue).to.be.true();
        });

        it('should not modify spender allowance if spender allowance is 2^256 - 1', async () => {
            const initOwnerBalance = await zeroEx.token.getBalanceAsync(tokenAddress, owner);
            const amountToTransfer = initOwnerBalance;
            const initSpenderAllowance = zeroEx.token.UNLIMITED_ALLOWANCE_IN_BASE_UNITS;
            await zeroEx.token.setAllowanceAsync(tokenAddress, owner, spender, initSpenderAllowance);
            await zeroEx.token.transferFromAsync(tokenAddress, owner, spender, spender, amountToTransfer, {
                gasLimit: constants.MAX_TOKEN_TRANSFERFROM_GAS,
            });

            const newSpenderAllowance = await zeroEx.token.getAllowanceAsync(tokenAddress, owner, spender);
            expect(initSpenderAllowance).to.be.bignumber.equal(newSpenderAllowance);
        });

        it('should transfer the correct balances if spender has sufficient allowance', async () => {
            const initOwnerBalance = await zeroEx.token.getBalanceAsync(tokenAddress, owner);
            const amountToTransfer = initOwnerBalance;
            const initSpenderAllowance = initOwnerBalance;
            await zeroEx.token.setAllowanceAsync(tokenAddress, owner, spender, initSpenderAllowance);
            await zeroEx.token.transferFromAsync(tokenAddress, owner, spender, spender, amountToTransfer, {
                gasLimit: constants.MAX_TOKEN_TRANSFERFROM_GAS,
            });

            const newOwnerBalance = await zeroEx.token.getBalanceAsync(tokenAddress, owner);
            const newSpenderBalance = await zeroEx.token.getBalanceAsync(tokenAddress, spender);

            expect(newOwnerBalance).to.be.bignumber.equal(0);
            expect(newSpenderBalance).to.be.bignumber.equal(initOwnerBalance);
        });

        it('should modify allowance if spender has sufficient allowance less than 2^256 - 1', async () => {
            const initOwnerBalance = await zeroEx.token.getBalanceAsync(tokenAddress, owner);
            const amountToTransfer = initOwnerBalance;
            const initSpenderAllowance = initOwnerBalance;
            await zeroEx.token.setAllowanceAsync(tokenAddress, owner, spender, initSpenderAllowance);
            await zeroEx.token.transferFromAsync(tokenAddress, owner, spender, spender, amountToTransfer, {
                gasLimit: constants.MAX_TOKEN_TRANSFERFROM_GAS,
            });

            const newSpenderAllowance = await zeroEx.token.getAllowanceAsync(tokenAddress, owner, spender);
            expect(newSpenderAllowance).to.be.bignumber.equal(0);
        });
    });
});
