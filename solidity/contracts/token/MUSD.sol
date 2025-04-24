// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../dependencies/CheckContract.sol";
import "./IMUSD.sol";

contract MUSD is ERC20Permit, Ownable, CheckContract, IMUSD {
    bool public initialized;

    // --- Addresses ---
    mapping(address => bool) public burnList;
    mapping(address => bool) public mintList;

    uint256 public governanceTimeDelay;

    address public pendingTroveManager;
    address public pendingStabilityPool;
    address public pendingBorrowerOperations;
    address public pendingInterestRateManager;

    address[] public pendingRevokedMintAddresses;
    address[] public pendingRevokedBurnAddresses;
    address[] public pendingAddedMintAddresses;

    uint256 public revokeMintListInitiated;
    uint256 public revokeBurnListInitiated;
    uint256 public addContractsInitiated;
    uint256 public addMintListInitiated;

    modifier onlyAfterGovernanceDelay(uint256 _changeInitializedTimestamp) {
        require(_changeInitializedTimestamp > 0, "Change not initiated");
        require(
            // solhint-disable-next-line not-rely-on-time
            block.timestamp >=
                _changeInitializedTimestamp + governanceTimeDelay,
            "Governance delay has not elapsed"
        );
        _;
    }

    constructor()
        Ownable(msg.sender)
        ERC20("Mezo USD", "MUSD")
        ERC20Permit("Mezo USD")
    {}

    // Initializes token with system contracts outside of the constructor
    // allowing the token deployer to establish stable address for the contract,
    // irrespective of the system contract addresses. Can only be called by
    // the owner (the deployer before the rights are passed) and only one time.
    function initialize(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress,
        address _interestRateManagerAddress,
        uint256 _governanceTimeDelay
    ) external onlyOwner {
        require(!initialized, "Already initialized");
        initialized = true;

        _addSystemContracts(
            _troveManagerAddress,
            _stabilityPoolAddress,
            _borrowerOperationsAddress,
            _interestRateManagerAddress
        );

        require(governanceTimeDelay <= 30 weeks, "Governance delay is too big");
        governanceTimeDelay = _governanceTimeDelay;
    }

    // --- Governance ---

    function startRevokeMintList(
        address[] calldata _accounts
    ) external onlyOwner {
        uint accountsLength = _accounts.length;
        for (uint i = 0; i < accountsLength; i++) {
            require(mintList[_accounts[i]], "Incorrect address to revoke");
        }

        // solhint-disable-next-line not-rely-on-time
        revokeMintListInitiated = block.timestamp;
        pendingRevokedMintAddresses = _accounts;
    }

    function cancelRevokeMintList() external onlyOwner {
        require(
            revokeMintListInitiated != 0,
            "Revoking from mint list is not started"
        );

        revokeMintListInitiated = 0;
        pendingRevokedMintAddresses = new address[](0);
    }

    function finalizeRevokeMintList()
        external
        onlyOwner
        onlyAfterGovernanceDelay(revokeMintListInitiated)
    {
        uint accountsLength = pendingRevokedMintAddresses.length;
        for (uint i = 0; i < accountsLength; i++) {
            mintList[pendingRevokedMintAddresses[i]] = false;
        }
        revokeMintListInitiated = 0;
        pendingRevokedMintAddresses = new address[](0);
    }

    function startAddMintList(address[] calldata _accounts) external onlyOwner {
        uint accountsLength = _accounts.length;
        for (uint i = 0; i < accountsLength; i++) {
            require(!mintList[_accounts[i]], "Incorrect address to add");
        }

        // solhint-disable-next-line not-rely-on-time
        addMintListInitiated = block.timestamp;
        pendingAddedMintAddresses = _accounts;
    }

    function cancelAddMintList() external onlyOwner {
        require(
            addMintListInitiated != 0,
            "Adding to mint list is not started"
        );

        addMintListInitiated = 0;
        pendingAddedMintAddresses = new address[](0);
    }

    function finalizeAddMintList()
        external
        onlyOwner
        onlyAfterGovernanceDelay(addMintListInitiated)
    {
        uint accountsLength = pendingAddedMintAddresses.length;
        for (uint i = 0; i < accountsLength; i++) {
            mintList[pendingAddedMintAddresses[i]] = true;
        }
        addMintListInitiated = 0;
        pendingAddedMintAddresses = new address[](0);
    }

    function startAddContracts(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress,
        address _interestRateManagerAddress
    ) external onlyOwner {
        checkContract(_troveManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_borrowerOperationsAddress);

        // save as provisional contracts to add
        // slither-disable-next-line missing-zero-check
        pendingTroveManager = _troveManagerAddress;
        // slither-disable-next-line missing-zero-check
        pendingStabilityPool = _stabilityPoolAddress;
        // slither-disable-next-line missing-zero-check
        pendingBorrowerOperations = _borrowerOperationsAddress;
        // slither-disable-next-line missing-zero-check
        pendingInterestRateManager = _interestRateManagerAddress;

        // save block number
        // solhint-disable-next-line not-rely-on-time
        addContractsInitiated = block.timestamp;
    }

    function cancelAddContracts() external onlyOwner {
        require(addContractsInitiated != 0, "Adding contracts is not started");

        addContractsInitiated = 0;
        pendingTroveManager = address(0);
        pendingStabilityPool = address(0);
        pendingBorrowerOperations = address(0);
        pendingInterestRateManager = address(0);
    }

    function finalizeAddContracts()
        external
        onlyOwner
        onlyAfterGovernanceDelay(addContractsInitiated)
    {
        // make sure minimum blocks has passed
        _addSystemContracts(
            pendingTroveManager,
            pendingStabilityPool,
            pendingBorrowerOperations,
            pendingInterestRateManager
        );
        addContractsInitiated = 0;
        pendingTroveManager = address(0);
        pendingStabilityPool = address(0);
        pendingBorrowerOperations = address(0);
        pendingInterestRateManager = address(0);
    }

    function startRevokeBurnList(
        address[] calldata _accounts
    ) external onlyOwner {
        uint accountsLength = _accounts.length;
        for (uint i = 0; i < accountsLength; i++) {
            address account = _accounts[i];

            require(burnList[account], "Incorrect address to revoke");
        }

        // solhint-disable-next-line not-rely-on-time
        revokeBurnListInitiated = block.timestamp;
        pendingRevokedBurnAddresses = _accounts;
    }

    function cancelRevokeBurnList() external onlyOwner {
        require(
            revokeBurnListInitiated != 0,
            "Revoking from burn list is not started"
        );

        revokeBurnListInitiated = 0;
        pendingRevokedBurnAddresses = new address[](0);
    }

    function finalizeRevokeBurnList()
        external
        onlyOwner
        onlyAfterGovernanceDelay(revokeBurnListInitiated)
    {
        uint accountsLength = pendingRevokedBurnAddresses.length;
        for (uint i = 0; i < accountsLength; i++) {
            address account = pendingRevokedBurnAddresses[i];

            burnList[account] = false;
        }
        revokeBurnListInitiated = 0;
        pendingRevokedBurnAddresses = new address[](0);
    }

    // --- Functions for intra-Liquity calls ---

    function mint(address _account, uint256 _amount) external {
        require(mintList[msg.sender], "MUSD: Caller not allowed to mint");
        _mint(_account, _amount);
    }

    function burn(address _account, uint256 _amount) external {
        require(burnList[msg.sender], "MUSD: Caller not allowed to burn");
        _burn(_account, _amount);
    }

    function transfer(
        address to,
        uint256 amount
    ) public virtual override(ERC20, IERC20) returns (bool) {
        require(to != address(0), "ERC20: transfer to the zero address");
        require(to != address(this), "ERC20: transfer to the contract address");
        return super.transfer(to, amount);
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override(ERC20, IERC20) returns (bool) {
        require(to != address(0), "ERC20: transfer to the zero address");
        require(to != address(this), "ERC20: transfer to the contract address");
        return super.transferFrom(from, to, amount);
    }

    function nonces(
        address owner
    )
        public
        view
        virtual
        override(ERC20Permit, IERC20Permit)
        returns (uint256)
    {
        return super.nonces(owner);
    }

    function _addSystemContracts(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress,
        address _interestRateManagerAddress
    ) internal {
        checkContract(_troveManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_interestRateManagerAddress);

        burnList[_troveManagerAddress] = true;
        emit TroveManagerAddressAdded(_troveManagerAddress);

        burnList[_stabilityPoolAddress] = true;
        emit StabilityPoolAddressAdded(_stabilityPoolAddress);

        burnList[_borrowerOperationsAddress] = true;
        mintList[_borrowerOperationsAddress] = true;
        emit BorrowerOperationsAddressAdded(_borrowerOperationsAddress);

        mintList[_interestRateManagerAddress] = true;
        emit InterestRateManagerAddressAdded(_interestRateManagerAddress);
    }
}
