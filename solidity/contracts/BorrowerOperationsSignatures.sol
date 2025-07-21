// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./dependencies/CheckContract.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/IBorrowerOperationsSignatures.sol";
import "./interfaces/IInterestRateManager.sol";

contract BorrowerOperationsSignatures is
    IBorrowerOperationsSignatures,
    CheckContract,
    EIP712Upgradeable,
    OwnableUpgradeable
{
    using ECDSA for bytes32;

    struct AddColl {
        address upperHint;
        address lowerHint;
        address borrower;
        uint256 deadline;
    }

    struct OpenTrove {
        uint256 debtAmount;
        address upperHint;
        address lowerHint;
        address borrower;
        address recipient;
        uint256 deadline;
    }

    struct WithdrawColl {
        uint256 amount;
        address upperHint;
        address lowerHint;
        address borrower;
        address recipient;
        uint256 deadline;
    }

    struct RepayMUSD {
        uint256 amount;
        address upperHint;
        address lowerHint;
        address borrower;
        uint256 deadline;
    }

    struct WithdrawMUSD {
        uint256 amount;
        address upperHint;
        address lowerHint;
        address borrower;
        address recipient;
        uint256 deadline;
    }

    struct AdjustTrove {
        uint256 collWithdrawal;
        uint256 debtChange;
        bool isDebtIncrease;
        address upperHint;
        address lowerHint;
        address borrower;
        address recipient;
        uint256 deadline;
    }

    struct CloseTrove {
        address borrower;
        address recipient;
        uint256 deadline;
    }

    struct Refinance {
        address upperHint;
        address lowerHint;
        address borrower;
        uint256 deadline;
    }

    struct ClaimCollateral {
        address borrower;
        address recipient;
        uint256 deadline;
    }

    string private constant SIGNING_DOMAIN = "BorrowerOperationsSignatures";
    string private constant SIGNATURE_VERSION = "1";

    bytes32 private constant OPEN_TROVE_TYPEHASH =
        keccak256(
            "OpenTrove(uint256 assetAmount,uint256 debtAmount,address borrower,address recipient,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant ADD_COLL_TYPEHASH =
        keccak256(
            "AddColl(uint256 assetAmount,address borrower,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant WITHDRAW_COLL_TYPEHASH =
        keccak256(
            "WithdrawColl(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant REPAY_MUSD_TYPEHASH =
        keccak256(
            "RepayMUSD(uint256 amount,address borrower,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant WITHDRAW_MUSD_TYPEHASH =
        keccak256(
            "WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant ADJUST_TROVE_TYPEHASH =
        keccak256(
            "AdjustTrove(uint256 collWithdrawal,uint256 debtChange,bool isDebtIncrease,uint256 assetAmount,address borrower,address recipient,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant CLOSE_TROVE_TYPEHASH =
        keccak256(
            "CloseTrove(address borrower,address recipient,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant REFINANCE_TYPEHASH =
        keccak256(
            "Refinance(address borrower,uint16 interestRate,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant CLAIM_COLLATERAL_TYPEHASH =
        keccak256(
            "ClaimCollateral(address borrower,address recipient,uint256 nonce,uint256 deadline)"
        );

    mapping(address => uint256) private nonces;
    address public activePoolAddress;
    IBorrowerOperations public borrowerOperations;
    address public collSurplusPoolAddress;
    address public defaultPoolAddress;
    IInterestRateManager public interestRateManager;
    address public stabilityPoolAddress;

    event ActivePoolAddressChanged(address _activePoolAddress);
    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event CollSurplusPoolAddressChanged(address _newCollSurplusPoolAddress);
    event DefaultPoolAddressChanged(address _newDefaultPoolAddress);
    event InterestRateManagerAddressChanged(
        address _newInterestRateManagerAddress
    );
    event StabilityPoolAddressChanged(address _newStabilityPoolAddress);

    modifier properRecipient(address _recipient) {
        require(
            _recipient != activePoolAddress,
            "BorrowerOperationsSignatures: recipient must not be the active pool"
        );
        require(
            _recipient != collSurplusPoolAddress,
            "BorrowerOperationsSignatures: recipient must not be the coll surplus pool"
        );
        require(
            _recipient != defaultPoolAddress,
            "BorrowerOperationsSignatures: recipient must not be the default pool"
        );
        require(
            _recipient != stabilityPoolAddress,
            "BorrowerOperationsSignatures: recipient must not be the stability pool"
        );
        _;
    }

    function initialize() external initializer {
        __Ownable_init(msg.sender);
        __EIP712_init_unchained(SIGNING_DOMAIN, SIGNATURE_VERSION);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function setAddresses(
        address _activePoolAddress,
        address _borrowerOperationsAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _interestRateManagerAddress,
        address _stabilityPoolAddress
    ) external onlyOwner {
        checkContract(_activePoolAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_interestRateManagerAddress);
        checkContract(_stabilityPoolAddress);

        // slither-disable-start missing-zero-check
        activePoolAddress = _activePoolAddress;
        borrowerOperations = IBorrowerOperations(_borrowerOperationsAddress);
        collSurplusPoolAddress = _collSurplusPoolAddress;
        defaultPoolAddress = _defaultPoolAddress;
        interestRateManager = IInterestRateManager(_interestRateManagerAddress);
        stabilityPoolAddress = _stabilityPoolAddress;
        // slither-disable-end missing-zero-check

        emit ActivePoolAddressChanged(_activePoolAddress);
        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit InterestRateManagerAddressChanged(_interestRateManagerAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);

        renounceOwnership();
    }

    function setPoolAddresses(
        address _activePoolAddress,
        address _collSurplusPoolAddress,
        address _defaultPoolAddress,
        address _stabilityPoolAddress
    ) external {
        require(
            activePoolAddress == address(0),
            "BorrowerOperationsSignatures: The active pool is already set"
        );
        require(
            collSurplusPoolAddress == address(0),
            "BorrowerOperationsSignatures: The coll surplus pool is already set"
        );
        require(
            defaultPoolAddress == address(0),
            "BorrowerOperationsSignatures: The default pool is already set"
        );
        require(
            stabilityPoolAddress == address(0),
            "BorrowerOperationsSignatures: The stability pool is already set"
        );
        require(
            msg.sender == borrowerOperations.governableVariables().council(),
            "BorrowerOperationsSignatures: Caller is not the council."
        );

        checkContract(_activePoolAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_stabilityPoolAddress);

        // slither-disable-start missing-zero-check
        activePoolAddress = _activePoolAddress;
        collSurplusPoolAddress = _collSurplusPoolAddress;
        defaultPoolAddress = _defaultPoolAddress;
        stabilityPoolAddress = _stabilityPoolAddress;
        // slither-disable-end missing-zero-check

        emit ActivePoolAddressChanged(_activePoolAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
    }

    function addCollWithSignature(
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external payable {
        AddColl memory addCollData = AddColl({
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            deadline: _deadline
        });

        _verifySignature(
            ADD_COLL_TYPEHASH,
            abi.encode(msg.value, addCollData.borrower),
            addCollData.borrower,
            _signature,
            addCollData.deadline
        );

        borrowerOperations.restrictedAdjustTrove{value: msg.value}(
            addCollData.borrower,
            addCollData.borrower,
            msg.sender,
            0,
            0,
            false,
            addCollData.upperHint,
            addCollData.lowerHint
        );
    }

    function closeTroveWithSignature(
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external properRecipient(_recipient) {
        CloseTrove memory closeTroveData = CloseTrove({
            borrower: _borrower,
            recipient: _recipient,
            deadline: _deadline
        });

        _verifySignature(
            CLOSE_TROVE_TYPEHASH,
            abi.encode(closeTroveData.borrower, closeTroveData.recipient),
            closeTroveData.borrower,
            _signature,
            closeTroveData.deadline
        );

        borrowerOperations.restrictedCloseTrove(
            closeTroveData.borrower,
            msg.sender,
            closeTroveData.recipient
        );
    }

    function adjustTroveWithSignature(
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external payable properRecipient(_recipient) {
        AdjustTrove memory adjustTroveData = AdjustTrove({
            collWithdrawal: _collWithdrawal,
            debtChange: _debtChange,
            isDebtIncrease: _isDebtIncrease,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            recipient: _recipient,
            deadline: _deadline
        });

        _verifySignature(
            ADJUST_TROVE_TYPEHASH,
            abi.encode(
                adjustTroveData.collWithdrawal,
                adjustTroveData.debtChange,
                adjustTroveData.isDebtIncrease,
                msg.value,
                adjustTroveData.borrower,
                adjustTroveData.recipient
            ),
            adjustTroveData.borrower,
            _signature,
            adjustTroveData.deadline
        );

        borrowerOperations.restrictedAdjustTrove{value: msg.value}(
            adjustTroveData.borrower,
            adjustTroveData.recipient,
            msg.sender,
            adjustTroveData.collWithdrawal,
            adjustTroveData.debtChange,
            adjustTroveData.isDebtIncrease,
            adjustTroveData.upperHint,
            adjustTroveData.lowerHint
        );
    }

    function withdrawCollWithSignature(
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external properRecipient(_recipient) {
        WithdrawColl memory withdrawCollData = WithdrawColl({
            amount: _amount,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            recipient: _recipient,
            deadline: _deadline
        });

        _verifySignature(
            WITHDRAW_COLL_TYPEHASH,
            abi.encode(
                withdrawCollData.amount,
                withdrawCollData.borrower,
                withdrawCollData.recipient
            ),
            withdrawCollData.borrower,
            _signature,
            withdrawCollData.deadline
        );

        borrowerOperations.restrictedAdjustTrove(
            withdrawCollData.borrower,
            withdrawCollData.recipient,
            msg.sender,
            withdrawCollData.amount,
            0,
            false,
            withdrawCollData.upperHint,
            withdrawCollData.lowerHint
        );
    }

    function openTroveWithSignature(
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external payable {
        OpenTrove memory openTroveData = OpenTrove({
            debtAmount: _debtAmount,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            recipient: _recipient,
            deadline: _deadline
        });

        _verifySignature(
            OPEN_TROVE_TYPEHASH,
            abi.encode(
                msg.value,
                openTroveData.debtAmount,
                openTroveData.borrower,
                openTroveData.recipient
            ),
            openTroveData.borrower,
            _signature,
            openTroveData.deadline
        );

        borrowerOperations.restrictedOpenTrove{value: msg.value}(
            openTroveData.borrower,
            openTroveData.recipient,
            openTroveData.debtAmount,
            openTroveData.upperHint,
            openTroveData.lowerHint
        );
    }

    function withdrawMUSDWithSignature(
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external {
        WithdrawMUSD memory withdrawMUSDData = WithdrawMUSD({
            amount: _amount,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            recipient: _recipient,
            deadline: _deadline
        });

        _verifySignature(
            WITHDRAW_MUSD_TYPEHASH,
            abi.encode(
                withdrawMUSDData.amount,
                withdrawMUSDData.borrower,
                withdrawMUSDData.recipient
            ),
            withdrawMUSDData.borrower,
            _signature,
            withdrawMUSDData.deadline
        );

        borrowerOperations.restrictedAdjustTrove(
            withdrawMUSDData.borrower,
            withdrawMUSDData.recipient,
            msg.sender,
            0,
            withdrawMUSDData.amount,
            true,
            withdrawMUSDData.upperHint,
            withdrawMUSDData.lowerHint
        );
    }

    function repayMUSDWithSignature(
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external {
        RepayMUSD memory repayMUSDData = RepayMUSD({
            amount: _amount,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            deadline: _deadline
        });

        _verifySignature(
            REPAY_MUSD_TYPEHASH,
            abi.encode(repayMUSDData.amount, repayMUSDData.borrower),
            repayMUSDData.borrower,
            _signature,
            repayMUSDData.deadline
        );

        borrowerOperations.restrictedAdjustTrove(
            repayMUSDData.borrower,
            repayMUSDData.borrower,
            msg.sender,
            0,
            repayMUSDData.amount,
            false,
            repayMUSDData.upperHint,
            repayMUSDData.lowerHint
        );
    }

    function refinanceWithSignature(
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external {
        Refinance memory refinanceData = Refinance({
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            deadline: _deadline
        });

        _verifySignature(
            REFINANCE_TYPEHASH,
            abi.encode(
                refinanceData.borrower,
                interestRateManager.interestRate()
            ),
            _borrower,
            _signature,
            _deadline
        );

        borrowerOperations.restrictedRefinance(
            refinanceData.borrower,
            refinanceData.upperHint,
            refinanceData.lowerHint
        );
    }

    function claimCollateralWithSignature(
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external properRecipient(_recipient) {
        ClaimCollateral memory claimCollateralData = ClaimCollateral({
            borrower: _borrower,
            recipient: _recipient,
            deadline: _deadline
        });

        _verifySignature(
            CLAIM_COLLATERAL_TYPEHASH,
            abi.encode(
                claimCollateralData.borrower,
                claimCollateralData.recipient
            ),
            claimCollateralData.borrower,
            _signature,
            claimCollateralData.deadline
        );

        borrowerOperations.restrictedClaimCollateral(
            claimCollateralData.borrower,
            claimCollateralData.recipient
        );
    }

    function getNonce(address user) public view returns (uint256) {
        return nonces[user];
    }

    function _verifySignature(
        bytes32 _typeHash,
        bytes memory _data,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) internal {
        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp <= _deadline, "Signature expired");

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encodePacked(_typeHash, _data, nonces[_borrower], _deadline)
            )
        );

        address recoveredAddress = ECDSA.recover(digest, _signature);
        require(
            recoveredAddress == _borrower,
            "BorrowerOperationsSignatures: Invalid signature"
        );

        nonces[_borrower]++;
    }
}
