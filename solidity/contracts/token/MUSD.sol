// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../dependencies/CheckContract.sol";
import "./IMUSD.sol";

contract MUSD is ERC20Permit, Ownable, CheckContract, IMUSD {
    bool public initialized;

    mapping(address => bool) public burnList;
    mapping(address => bool) public mintList;

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
        address _interestRateManagerAddress
    ) external onlyOwner {
        require(!initialized, "Already initialized");
        initialized = true;

        setSystemContracts(
            _troveManagerAddress,
            _stabilityPoolAddress,
            _borrowerOperationsAddress,
            _interestRateManagerAddress
        );
    }

    // --- Governance ---

    function addToMintList(address _address) public onlyOwner {
        if (mintList[_address]) {
            revert AddressHasMintRole();
        }
        mintList[_address] = true;
        emit MintListAddressAdded(_address);
    }

    function removeFromMintList(address _address) public onlyOwner {
        if (!mintList[_address]) {
            revert AddressWithoutMintRole();
        }
        mintList[_address] = false;
        emit MintListAddressRemoved(_address);
    }

    function addToBurnList(address _address) public onlyOwner {
        if (burnList[_address]) {
            revert AddressHasBurnRole();
        }
        burnList[_address] = true;
        emit BurnListAddressAdded(_address);
    }

    function removeFromBurnList(address _address) public onlyOwner {
        if (!burnList[_address]) {
            revert AddressWithoutBurnRole();
        }
        burnList[_address] = false;
        emit BurnListAddressRemoved(_address);
    }

    function setSystemContracts(
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _borrowerOperationsAddress,
        address _interestRateManagerAddress
    ) public onlyOwner {
        checkContract(_troveManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_interestRateManagerAddress);

        addToBurnList(_troveManagerAddress);
        emit TroveManagerAddressAdded(_troveManagerAddress);

        addToBurnList(_stabilityPoolAddress);
        emit StabilityPoolAddressAdded(_stabilityPoolAddress);

        addToBurnList(_borrowerOperationsAddress);
        addToMintList(_borrowerOperationsAddress);
        emit BorrowerOperationsAddressAdded(_borrowerOperationsAddress);

        addToMintList(_interestRateManagerAddress);
        emit InterestRateManagerAddressAdded(_interestRateManagerAddress);
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
}
