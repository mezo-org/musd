// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "../TroveManager.sol";
import "../BorrowerOperations.sol";
import "../StabilityPool.sol";
import "../token/MUSD.sol";

contract EchidnaProxy {
    ITroveManager private immutable troveManager;
    IBorrowerOperations private immutable borrowerOperations;
    IStabilityPool private immutable stabilityPool;
    IMUSD private immutable musd;

    constructor(
        ITroveManager _troveManager,
        IBorrowerOperations _borrowerOperations,
        IStabilityPool _stabilityPool,
        IMUSD _musd
    ) {
        troveManager = _troveManager;
        borrowerOperations = _borrowerOperations;
        stabilityPool = _stabilityPool;
        musd = _musd;
    }

    receive() external payable {
        // do nothing
    }

    // TroveManager

    function liquidatePrx(address _user) external {
        troveManager.liquidate(_user);
    }

    function batchLiquidateTrovesPrx(address[] calldata _troveArray) external {
        troveManager.batchLiquidateTroves(_troveArray);
    }

    function redeemCollateralPrx(
        uint _mUSDAmount,
        address _firstRedemptionHint,
        address _upperPartialRedemptionHint,
        address _lowerPartialRedemptionHint,
        uint _partialRedemptionHintNICR,
        uint _maxIterations
    ) external {
        troveManager.redeemCollateral(
            _mUSDAmount,
            _firstRedemptionHint,
            _upperPartialRedemptionHint,
            _lowerPartialRedemptionHint,
            _partialRedemptionHintNICR,
            _maxIterations
        );
    }

    // Borrower Operations
    function openTrovePrx(
        uint _BTC,
        uint _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external payable {
        // slither-disable-start arbitrary-send-eth
        borrowerOperations.openTrove{value: _BTC}(
            _debtAmount,
            _upperHint,
            _lowerHint
        );
        // slither-disable-end arbitrary-send-eth
    }

    function addCollPrx(
        uint _BTC,
        address _upperHint,
        address _lowerHint
    ) external payable {
        // slither-disable-start arbitrary-send-eth
        borrowerOperations.addColl{value: _BTC}(_upperHint, _lowerHint);
        // slither-disable-end arbitrary-send-eth
    }

    function withdrawCollPrx(
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external {
        borrowerOperations.withdrawColl(_amount, _upperHint, _lowerHint);
    }

    function withdrawMUSDPrx(
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external {
        borrowerOperations.withdrawMUSD(_amount, _upperHint, _lowerHint);
    }

    function repayMUSDPrx(
        uint _amount,
        address _upperHint,
        address _lowerHint
    ) external {
        borrowerOperations.repayMUSD(_amount, _upperHint, _lowerHint);
    }

    function closeTrovePrx() external {
        borrowerOperations.closeTrove();
    }

    function adjustTrovePrx(
        uint _BTC,
        uint _collWithdrawal,
        uint _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external {
        // slither-disable-start arbitrary-send-eth
        borrowerOperations.adjustTrove{value: _BTC}(
            _collWithdrawal,
            _debtChange,
            _isDebtIncrease,
            _upperHint,
            _lowerHint
        );
        // slither-disable-end arbitrary-send-eth
    }

    function refinancePrx() external {
        borrowerOperations.refinance();
    }

    function claimCollateralPrx() external {
        borrowerOperations.claimCollateral();
    }

    // Pool Manager
    function provideToSPPrx(uint _amount) external {
        // slither-disable-next-line unused-return
        musd.approve(address(stabilityPool), _amount);
        stabilityPool.provideToSP(_amount);
    }

    function withdrawFromSPPrx(uint _amount) external {
        stabilityPool.withdrawFromSP(_amount);
    }

    function withdrawCollateralGainToTrovePrx() external {
        stabilityPool.withdrawCollateralGainToTrove(address(0), address(0));
    }

    // MUSD Token

    function transferPrx(
        address recipient,
        uint256 amount
    ) external returns (bool) {
        return musd.transfer(recipient, amount);
    }

    function approvePrx(
        address spender,
        uint256 amount
    ) external returns (bool) {
        return musd.approve(spender, amount);
    }

    function transferFromPrx(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool) {
        // slither-disable-next-line arbitrary-send-erc20
        return musd.transferFrom(sender, recipient, amount);
    }
}
