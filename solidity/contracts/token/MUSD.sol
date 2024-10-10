// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./../v2/dependencies/CheckContractV2.sol";
import "./IMUSD.sol";

contract MUSD is ERC20Permit, Ownable, CheckContractV2, IMUSD {
    // --- Addresses ---
    mapping(address => bool) public burnList;
    mapping(address => bool) public mintList;

    uint256 public immutable governanceTimeDelay;

    address public pendingTroveManager;
    address public pendingStabilityPool;
    address public pendingBorrowerOperations;

    address public pendingRevokedMintAddress;
    address public pendingRevokedBurnAddress;
    address public pendingAddedMintAddress;

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

    constructor(
        string memory name,
        string memory symbol,
        // slither-disable-next-line similar-names
        address _troveManagerAddress1,
        // slither-disable-next-line similar-names
        address _stabilityPoolAddress1,
        // slither-disable-next-line similar-names
        address _borrowerOperationsAddress1,
        address _troveManagerAddress2,
        address _stabilityPoolAddress2,
        address _borrowerOperationsAddress2,
        uint256 _governanceTimeDelay
    ) Ownable(msg.sender) ERC20(name, symbol) ERC20Permit(name) {
        // when created its linked to one set of contracts and collateral, other collateral types can be added via governance
        _addSystemContracts(
            _troveManagerAddress1,
            _stabilityPoolAddress1,
            _borrowerOperationsAddress1
        );
        if (_troveManagerAddress2 != address(0)) {
            _addSystemContracts(
                _troveManagerAddress2,
                _stabilityPoolAddress2,
                _borrowerOperationsAddress2
            );
        }
        governanceTimeDelay = _governanceTimeDelay;
        require(governanceTimeDelay <= 30 weeks, "Governance delay is too big");
    }

    // --- Governance ---

    function startRevokeMintList(address _account) external onlyOwner {
        require(mintList[_account], "Incorrect address to revoke");

        // solhint-disable-next-line not-rely-on-time
        revokeMintListInitiated = block.timestamp;
        pendingRevokedMintAddress = _account;
    }

    function cancelRevokeMintList() external onlyOwner {
        require(
            revokeMintListInitiated != 0,
            "Revoking from mint list is not started"
        );

        revokeMintListInitiated = 0;
        pendingRevokedMintAddress = address(0);
    }

    function finalizeRevokeMintList()
        external
        onlyOwner
        onlyAfterGovernanceDelay(revokeMintListInitiated)
    {
        mintList[pendingRevokedMintAddress] = false;
        revokeMintListInitiated = 0;
        pendingRevokedMintAddress = address(0);
    }

    function startAddMintList(address _account) external onlyOwner {
        require(!mintList[_account], "Incorrect address to add");

        // solhint-disable-next-line not-rely-on-time
        addMintListInitiated = block.timestamp;
        pendingAddedMintAddress = _account;
    }

    function cancelAddMintList() external onlyOwner {
        require(
            addMintListInitiated != 0,
            "Adding to mint list is not started"
        );

        addMintListInitiated = 0;
        pendingAddedMintAddress = address(0);
    }

    function finalizeAddMintList()
        external
        onlyOwner
        onlyAfterGovernanceDelay(addMintListInitiated)
    {
        mintList[pendingAddedMintAddress] = true;
        addMintListInitiated = 0;
        pendingAddedMintAddress = address(0);
    }

    function startAddContracts(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress
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
            pendingBorrowerOperations
        );
        addContractsInitiated = 0;
        pendingTroveManager = address(0);
        pendingStabilityPool = address(0);
        pendingBorrowerOperations = address(0);
    }

    function startRevokeBurnList(address _account) external onlyOwner {
        require(burnList[_account], "Incorrect address to revoke");

        // solhint-disable-next-line not-rely-on-time
        revokeBurnListInitiated = block.timestamp;
        pendingRevokedBurnAddress = _account;
    }

    function cancelRevokeBurnList() external onlyOwner {
        require(
            revokeBurnListInitiated != 0,
            "Revoking from burn list is not started"
        );

        revokeBurnListInitiated = 0;
        pendingRevokedBurnAddress = address(0);
    }

    function finalizeRevokeBurnList()
        external
        onlyOwner
        onlyAfterGovernanceDelay(revokeBurnListInitiated)
    {
        burnList[pendingRevokedBurnAddress] = false;
        revokeBurnListInitiated = 0;
        pendingRevokedBurnAddress = address(0);
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
        address _borrowerOperationsAddress
    ) internal {
        checkContract(_troveManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_borrowerOperationsAddress);

        burnList[_troveManagerAddress] = true;
        emit TroveManagerAddressAdded(_troveManagerAddress);

        burnList[_stabilityPoolAddress] = true;
        emit StabilityPoolAddressAdded(_stabilityPoolAddress);

        burnList[_borrowerOperationsAddress] = true;
        emit BorrowerOperationsAddressAdded(_borrowerOperationsAddress);

        mintList[_borrowerOperationsAddress] = true;
    }
}
