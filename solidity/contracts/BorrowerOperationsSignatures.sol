// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./dependencies/CheckContract.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/IBorrowerOperationsSignatures.sol";

contract BorrowerOperationsSignatures is
    IBorrowerOperationsSignatures,
    CheckContract,
    EIP712Upgradeable,
    OwnableUpgradeable
{
    using ECDSA for bytes32;

    struct AddColl {
        uint256 assetAmount;
        address upperHint;
        address lowerHint;
        address borrower;
        uint256 nonce;
        uint256 deadline;
    }

    struct OpenTrove {
        uint256 debtAmount;
        address upperHint;
        address lowerHint;
        address borrower;
        address recipient;
        uint256 nonce;
        uint256 deadline;
    }

    struct WithdrawColl {
        uint256 amount;
        address upperHint;
        address lowerHint;
        address borrower;
        address recipient;
        uint256 nonce;
        uint256 deadline;
    }

    struct RepayMUSD {
        uint256 amount;
        address upperHint;
        address lowerHint;
        address borrower;
        uint256 nonce;
        uint256 deadline;
    }

    struct WithdrawMUSD {
        uint256 amount;
        address upperHint;
        address lowerHint;
        address borrower;
        address recipient;
        uint256 nonce;
        uint256 deadline;
    }

    struct AdjustTrove {
        uint256 collWithdrawal;
        uint256 debtChange;
        bool isDebtIncrease;
        uint256 assetAmount;
        address upperHint;
        address lowerHint;
        address borrower;
        address recipient;
        uint256 nonce;
        uint256 deadline;
    }

    struct CloseTrove {
        address borrower;
        address recipient;
        uint256 nonce;
        uint256 deadline;
    }

    struct Refinance {
        address borrower;
        uint256 nonce;
        uint256 deadline;
    }

    struct ClaimCollateral {
        address borrower;
        address recipient;
        uint256 nonce;
        uint256 deadline;
    }

    string private constant SIGNING_DOMAIN = "BorrowerOperationsSignatures";
    string private constant SIGNATURE_VERSION = "1";

    bytes32 private constant OPEN_TROVE_TYPEHASH =
        keccak256(
            "OpenTrove(uint256 debtAmount,address upperHint,address lowerHint,address borrower,address recipient,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant ADD_COLL_TYPEHASH =
        keccak256(
            "AddColl(uint256 assetAmount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant WITHDRAW_COLL_TYPEHASH =
        keccak256(
            "WithdrawColl(uint256 amount,address upperHint,address lowerHint,address borrower,address recipient,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant REPAY_MUSD_TYPEHASH =
        keccak256(
            "RepayMUSD(uint256 amount,address upperHint,address lowerHint,address borrower,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant WITHDRAW_MUSD_TYPEHASH =
        keccak256(
            "WithdrawMUSD(uint256 amount,address upperHint,address lowerHint,address borrower,address recipient,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant ADJUST_TROVE_TYPEHASH =
        keccak256(
            "AdjustTrove(uint256 collWithdrawal,uint256 debtChange,bool isDebtIncrease,uint256 assetAmount,address upperHint,address lowerHint,address borrower,address recipient,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant CLOSE_TROVE_TYPEHASH =
        keccak256(
            "CloseTrove(address borrower,address recipient,uint256 nonce,uint256 deadline)"
        );

    bytes32 private constant REFINANCE_TYPEHASH =
        keccak256("Refinance(address borrower,uint256 nonce,uint256 deadline)");

    bytes32 private constant CLAIM_COLLATERAL_TYPEHASH =
        keccak256(
            "ClaimCollateral(address borrower,address recipient,uint256 nonce,uint256 deadline)"
        );

    mapping(address => uint256) private nonces;
    IBorrowerOperations private borrowerOperations;

    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );

    function initialize() external initializer {
        __Ownable_init(msg.sender);
        __EIP712_init_unchained(SIGNING_DOMAIN, SIGNATURE_VERSION);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function setAddresses(
        address _borrowerOperationsAddress
    ) external onlyOwner {
        checkContract(_borrowerOperationsAddress);

        // slither-disable-start missing-zero-check
        borrowerOperations = IBorrowerOperations(_borrowerOperationsAddress);
        // slither-disable-end missing-zero-check

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);

        renounceOwnership();
    }

    function addCollWithSignature(
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external payable {
        AddColl memory addCollData = AddColl({
            assetAmount: _assetAmount,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            nonce: nonces[_borrower],
            deadline: _deadline
        });

        _verifySignature(
            ADD_COLL_TYPEHASH,
            abi.encode(
                addCollData.assetAmount,
                addCollData.upperHint,
                addCollData.lowerHint,
                addCollData.borrower
            ),
            addCollData.borrower,
            _signature,
            addCollData.deadline
        );

        borrowerOperations.restrictedAdjustTrove{value: msg.value}(
            addCollData.borrower,
            addCollData.borrower,
            0,
            0,
            false,
            addCollData.assetAmount,
            addCollData.upperHint,
            addCollData.lowerHint
        );
    }

    function closeTroveWithSignature(
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external {
        CloseTrove memory closeTroveData = CloseTrove({
            borrower: _borrower,
            recipient: _recipient,
            nonce: nonces[_borrower],
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
            closeTroveData.recipient
        );
    }

    function adjustTroveWithSignature(
        uint256 _collWithdrawal,
        uint256 _debtChange,
        bool _isDebtIncrease,
        uint256 _assetAmount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external payable {
        _assetAmount = msg.value;

        AdjustTrove memory adjustTroveData = AdjustTrove({
            collWithdrawal: _collWithdrawal,
            debtChange: _debtChange,
            isDebtIncrease: _isDebtIncrease,
            assetAmount: _assetAmount,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            recipient: _recipient,
            nonce: nonces[_borrower],
            deadline: _deadline
        });

        _verifySignature(
            ADJUST_TROVE_TYPEHASH,
            abi.encode(
                adjustTroveData.collWithdrawal,
                adjustTroveData.debtChange,
                adjustTroveData.isDebtIncrease,
                adjustTroveData.assetAmount,
                adjustTroveData.upperHint,
                adjustTroveData.lowerHint,
                adjustTroveData.borrower,
                adjustTroveData.recipient
            ),
            adjustTroveData.borrower,
            _signature,
            adjustTroveData.deadline
        );

        borrowerOperations.restrictedAdjustTrove(
            adjustTroveData.borrower,
            adjustTroveData.recipient,
            adjustTroveData.collWithdrawal,
            adjustTroveData.debtChange,
            adjustTroveData.isDebtIncrease,
            adjustTroveData.assetAmount,
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
    ) external {
        // solhint-disable not-rely-on-time
        require(block.timestamp <= _deadline, "Signature expired");
        uint256 nonce = nonces[_borrower];
        WithdrawColl memory withdrawCollData = WithdrawColl({
            amount: _amount,
            upperHint: _upperHint,
            lowerHint: _lowerHint,
            borrower: _borrower,
            recipient: _recipient,
            nonce: nonce,
            deadline: _deadline
        });

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    WITHDRAW_COLL_TYPEHASH,
                    withdrawCollData.amount,
                    withdrawCollData.upperHint,
                    withdrawCollData.lowerHint,
                    withdrawCollData.borrower,
                    withdrawCollData.recipient,
                    withdrawCollData.nonce,
                    withdrawCollData.deadline
                )
            )
        );

        address recoveredAddress = ECDSA.recover(digest, _signature);
        require(
            recoveredAddress == _borrower,
            "BorrowerOperationsSignatures: Invalid signature"
        );

        nonces[_borrower]++;

        borrowerOperations.restrictedAdjustTrove(
            withdrawCollData.borrower,
            withdrawCollData.recipient,
            withdrawCollData.amount,
            0,
            false,
            0,
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
            nonce: nonces[_borrower],
            deadline: _deadline
        });

        _verifySignature(
            OPEN_TROVE_TYPEHASH,
            abi.encode(
                openTroveData.debtAmount,
                openTroveData.upperHint,
                openTroveData.lowerHint,
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
            nonce: nonces[_borrower],
            deadline: _deadline
        });

        _verifySignature(
            WITHDRAW_MUSD_TYPEHASH,
            abi.encode(
                withdrawMUSDData.amount,
                withdrawMUSDData.upperHint,
                withdrawMUSDData.lowerHint,
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
            0,
            withdrawMUSDData.amount,
            true,
            0,
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
            nonce: nonces[_borrower],
            deadline: _deadline
        });

        _verifySignature(
            REPAY_MUSD_TYPEHASH,
            abi.encode(
                repayMUSDData.amount,
                repayMUSDData.upperHint,
                repayMUSDData.lowerHint,
                repayMUSDData.borrower
            ),
            repayMUSDData.borrower,
            _signature,
            repayMUSDData.deadline
        );

        borrowerOperations.restrictedAdjustTrove(
            repayMUSDData.borrower,
            repayMUSDData.borrower,
            0,
            repayMUSDData.amount,
            false,
            0,
            repayMUSDData.upperHint,
            repayMUSDData.lowerHint
        );
    }

    function refinanceWithSignature(
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external {
        Refinance memory refinanceData = Refinance({
            borrower: _borrower,
            nonce: nonces[_borrower],
            deadline: _deadline
        });

        _verifySignature(
            REFINANCE_TYPEHASH,
            abi.encode(refinanceData.borrower),
            _borrower,
            _signature,
            _deadline
        );

        borrowerOperations.restrictedRefinance(refinanceData.borrower);
    }

    function claimCollateralWithSignature(
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external {
        ClaimCollateral memory claimCollateralData = ClaimCollateral({
            borrower: _borrower,
            recipient: _recipient,
            nonce: nonces[_borrower],
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
            claimCollateralData.borrower
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
        uint256 nonce = nonces[_borrower];

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encodePacked(_typeHash, _data, nonce, _deadline))
        );

        address recoveredAddress = ECDSA.recover(digest, _signature);
        require(
            recoveredAddress == _borrower,
            "BorrowerOperationsSignatures: Invalid signature"
        );

        nonces[_borrower]++;
    }
}
