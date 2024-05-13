// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./dependencies/LiquityBase.sol";
import "./dependencies/SendCollateral.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ICollSurplusPool.sol";
import "./interfaces/IMUSD.sol";
import "./interfaces/ISortedTroves.sol";
import "./interfaces/ITroveManager.sol";
import "./interfaces/IPCV.sol";

contract BorrowerOperations is
    LiquityBase,
    Ownable,
    CheckContract,
    SendCollateral,
    IBorrowerOperations
{
    string public constant name = "BorrowerOperations";

    // --- Connected contract declarations ---

    ITroveManager public troveManager;

    address public collateralAddress;
    address public gasPoolAddress;
    address public pcvAddress;
    address public stabilityPoolAddress;

    ICollSurplusPool public collSurplusPool;

    IMUSD public musd;

    // A doubly linked list of Troves, sorted by their collateral ratios
    ISortedTroves public sortedTroves;

    constructor() Ownable(msg.sender) {}

    // --- Borrower Trove Operations ---
    function openTrove(
        uint256 _maxFeePercentage,
        uint256 _debtAmount,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {}

    // Send collateral to a trove
    function addColl(
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {}

    // Send collateral to a trove. Called by only the Stability Pool.
    function moveCollateralGainToTrove(
        address _borrower,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {}

    // Withdraw collateral from a trove
    function withdrawColl(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {}

    // Withdraw MUSD tokens from a trove: mint new MUSD tokens to the owner, and increase the trove's debt accordingly
    function withdrawMUSD(
        uint256 _maxFeePercentage,
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {}

    // Repay MUSD tokens to a Trove: Burn the repaid MUSD tokens, and reduce the trove's debt accordingly
    function repayMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external override {}

    function closeTrove() external override {}

    function adjustTrove(
        uint256 _maxFeePercentage,
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {}

    // Claim remaining collateral from a redemption or from a liquidation with ICR > MCR in Recovery Mode
    function claimCollateral() external override {}

    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress,
        address _defaultPoolAddress,
        address _stabilityPoolAddress,
        address _gasPoolAddress,
        address _collSurplusPoolAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _musdTokenAddress,
        address _pcvAddress,
        address _collateralAddress
    ) external override onlyOwner {
        // This makes impossible to open a trove with zero withdrawn MUSD
        assert(MIN_NET_DEBT > 0);

        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_gasPoolAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_priceFeedAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_musdTokenAddress);
        checkContract(_pcvAddress);
        if (_collateralAddress != address(0)) {
            checkContract(_collateralAddress);
        }

        troveManager = ITroveManager(_troveManagerAddress);
        activePool = IActivePool(_activePoolAddress);
        defaultPool = IDefaultPool(_defaultPoolAddress);
        // slither-disable-next-line missing-zero-check
        stabilityPoolAddress = _stabilityPoolAddress;
        // slither-disable-next-line missing-zero-check
        gasPoolAddress = _gasPoolAddress;
        collSurplusPool = ICollSurplusPool(_collSurplusPoolAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        musd = IMUSD(_musdTokenAddress);
        // slither-disable-next-line missing-zero-check
        pcvAddress = _pcvAddress;
        // slither-disable-next-line missing-zero-check
        collateralAddress = _collateralAddress;

        require(
            (Ownable(_defaultPoolAddress).owner() != address(0) ||
                defaultPool.collateralAddress() == _collateralAddress) &&
                (Ownable(_activePoolAddress).owner() != address(0) ||
                    activePool.collateralAddress() == _collateralAddress) &&
                (Ownable(_stabilityPoolAddress).owner() != address(0) ||
                    IStabilityPool(stabilityPoolAddress).collateralAddress() ==
                    _collateralAddress) &&
                (Ownable(_collSurplusPoolAddress).owner() != address(0) ||
                    collSurplusPool.collateralAddress() ==
                    _collateralAddress) &&
                (address(IPCV(pcvAddress).musd()) == address(0) ||
                    address(IPCV(pcvAddress).collateralERC20()) ==
                    _collateralAddress),
            "The same collateral address must be used for the entire set of contracts"
        );

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit GasPoolAddressChanged(_gasPoolAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);
        emit PCVAddressChanged(_pcvAddress);
        emit CollateralAddressChanged(_collateralAddress);

        renounceOwnership();
    }

    function getCompositeDebt(
        uint256 _debt
    ) external pure override returns (uint) {
        return _debt;
    }
}
