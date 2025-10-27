// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Vault.sol";

contract VaultFactory is Ownable {
    address public vaultImplementation;
    address public treasury;

    address[] public allVaults;
    mapping(address => bool) public isVault;
    mapping(address => address[]) public userVaults;

    // 新增状态变量
    mapping(address => VaultInfo) public vaultInfo;
    address public defaultStrategyManager;
    uint256 public vaultCreationFee;
    bool public paused;
    mapping(address => bool) public authorizedCreators; // 授权创建者
    bool public restrictedCreation; // 是否限制创建

    struct VaultInfo {
        address asset;
        address creator;
        uint256 createdAt;
        string name;
        string symbol;
        bool active;
    }

    event VaultCreated(
        address indexed vault,
        address indexed asset,
        address indexed creator,
        string name,
        string symbol
    );
    event ImplementationUpgraded(address indexed newImplementation);
    event VaultDeactivated(address indexed vault);
    event VaultReactivated(address indexed vault);
    event CreationFeeUpdated(uint256 newFee);
    event DefaultStrategyManagerUpdated(address indexed newManager);
    event CreatorAuthorizationChanged(address indexed creator, bool authorized);
    event PauseStatusChanged(bool isPaused);
    event TreasuryUpdated(address indexed newTreasury);

    constructor(address _treasury) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        vaultImplementation = address(new Vault());
        vaultCreationFee = 0;
        paused = false;
        restrictedCreation = false;
    }

    modifier whenNotPaused() {
        require(!paused, "Factory is paused");
        _;
    }

    modifier onlyAuthorized() {
        if (restrictedCreation) {
            require(
                authorizedCreators[msg.sender] || msg.sender == owner(),
                "Not authorized to create vault"
            );
        }
        _;
    }

    function createVault(
        address asset,
        string memory name,
        string memory symbol,
        address strategyManager
    ) external payable whenNotPaused onlyAuthorized returns (address vault) {
        require(asset != address(0), "Invalid asset");
        require(bytes(name).length > 0, "Name cannot be empty");
        require(bytes(symbol).length > 0, "Symbol cannot be empty");
        require(msg.value >= vaultCreationFee, "Insufficient creation fee");

        address _strategyManager = strategyManager;
        if (_strategyManager == address(0)) {
            _strategyManager = defaultStrategyManager;
        }

        bytes memory initData = abi.encodeWithSignature(
            "initialize(address,string,string,address,address)",
            asset,
            name,
            symbol,
            treasury,
            _strategyManager
        );

        vault = address(new ERC1967Proxy(vaultImplementation, initData));

        allVaults.push(vault);
        isVault[vault] = true;
        userVaults[msg.sender].push(vault);

        vaultInfo[vault] = VaultInfo({
            asset: asset,
            creator: msg.sender,
            createdAt: block.timestamp,
            name: name,
            symbol: symbol,
            active: true
        });

        // 转移创建费用到treasury
        if (msg.value > 0) {
            (bool success, ) = treasury.call{value: msg.value}("");
            require(success, "Fee transfer failed");
        }

        emit VaultCreated(vault, asset, msg.sender, name, symbol);
    }

    function createVaultBatch(
        address[] calldata assets,
        string[] calldata names,
        string[] calldata symbols,
        address strategyManager
    ) external payable whenNotPaused onlyAuthorized returns (address[] memory vaults) {
        require(
            assets.length == names.length && names.length == symbols.length,
            "Length mismatch"
        );
        require(
            msg.value >= vaultCreationFee * assets.length,
            "Insufficient creation fee"
        );

        vaults = new address[](assets.length);

        for (uint256 i = 0; i < assets.length; i++) {
            vaults[i] = this.createVault{value: vaultCreationFee}(
                assets[i],
                names[i],
                symbols[i],
                strategyManager
            );
        }
    }

    function upgradeImplementation(address newImplementation)
        external
        onlyOwner
    {
        require(newImplementation != address(0), "Invalid implementation");
        vaultImplementation = newImplementation;
        emit ImplementationUpgraded(newImplementation);
    }

    function getAllVaults() external view returns (address[] memory) {
        return allVaults;
    }

    function getUserVaults(address user)
        external
        view
        returns (address[] memory)
    {
        return userVaults[user];
    }

    function vaultCount() external view returns (uint256) {
        return allVaults.length;
    }

    // ============ 新增功能函数 ============

    /**
     * @notice 设置vault创建费用
     * @param _fee 新的创建费用
     */
    function setVaultCreationFee(uint256 _fee) external onlyOwner {
        vaultCreationFee = _fee;
        emit CreationFeeUpdated(_fee);
    }

    /**
     * @notice 设置默认策略管理器
     * @param _strategyManager 策略管理器地址
     */
    function setDefaultStrategyManager(address _strategyManager)
        external
        onlyOwner
    {
        require(_strategyManager != address(0), "Invalid strategy manager");
        defaultStrategyManager = _strategyManager;
        emit DefaultStrategyManagerUpdated(_strategyManager);
    }

    /**
     * @notice 设置treasury地址
     * @param _treasury 新的treasury地址
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /**
     * @notice 暂停/恢复工厂
     * @param _paused 是否暂停
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseStatusChanged(_paused);
    }

    /**
     * @notice 设置创建限制
     * @param _restricted 是否限制
     */
    function setRestrictedCreation(bool _restricted) external onlyOwner {
        restrictedCreation = _restricted;
    }

    /**
     * @notice 授权/取消授权创建者
     * @param creator 创建者地址
     * @param authorized 是否授权
     */
    function setCreatorAuthorization(address creator, bool authorized)
        external
        onlyOwner
    {
        authorizedCreators[creator] = authorized;
        emit CreatorAuthorizationChanged(creator, authorized);
    }

    /**
     * @notice 批量授权创建者
     * @param creators 创建者地址数组
     * @param authorizations 授权状态数组
     */
    function setCreatorAuthorizationBatch(
        address[] calldata creators,
        bool[] calldata authorizations
    ) external onlyOwner {
        require(creators.length == authorizations.length, "Length mismatch");

        for (uint256 i = 0; i < creators.length; i++) {
            authorizedCreators[creators[i]] = authorizations[i];
            emit CreatorAuthorizationChanged(creators[i], authorizations[i]);
        }
    }

    /**
     * @notice 停用vault
     * @param vault vault地址
     */
    function deactivateVault(address vault) external onlyOwner {
        require(isVault[vault], "Not a vault");
        require(vaultInfo[vault].active, "Already deactivated");

        vaultInfo[vault].active = false;
        emit VaultDeactivated(vault);
    }

    /**
     * @notice 重新激活vault
     * @param vault vault地址
     */
    function reactivateVault(address vault) external onlyOwner {
        require(isVault[vault], "Not a vault");
        require(!vaultInfo[vault].active, "Already active");

        vaultInfo[vault].active = true;
        emit VaultReactivated(vault);
    }

    /**
     * @notice 获取vault详细信息
     * @param vault vault地址
     */
    function getVaultInfo(address vault)
        external
        view
        returns (VaultInfo memory)
    {
        require(isVault[vault], "Not a vault");
        return vaultInfo[vault];
    }

    /**
     * @notice 获取活跃的vaults
     */
    function getActiveVaults() external view returns (address[] memory) {
        uint256 activeCount = 0;

        // 计算活跃vault数量
        for (uint256 i = 0; i < allVaults.length; i++) {
            if (vaultInfo[allVaults[i]].active) {
                activeCount++;
            }
        }

        // 创建结果数组
        address[] memory activeVaults = new address[](activeCount);
        uint256 index = 0;

        for (uint256 i = 0; i < allVaults.length; i++) {
            if (vaultInfo[allVaults[i]].active) {
                activeVaults[index] = allVaults[i];
                index++;
            }
        }

        return activeVaults;
    }

    /**
     * @notice 获取用户的活跃vaults
     * @param user 用户地址
     */
    function getUserActiveVaults(address user)
        external
        view
        returns (address[] memory)
    {
        address[] memory userVaultsList = userVaults[user];
        uint256 activeCount = 0;

        // 计算活跃vault数量
        for (uint256 i = 0; i < userVaultsList.length; i++) {
            if (vaultInfo[userVaultsList[i]].active) {
                activeCount++;
            }
        }

        // 创建结果数组
        address[] memory activeVaults = new address[](activeCount);
        uint256 index = 0;

        for (uint256 i = 0; i < userVaultsList.length; i++) {
            if (vaultInfo[userVaultsList[i]].active) {
                activeVaults[index] = userVaultsList[i];
                index++;
            }
        }

        return activeVaults;
    }

    /**
     * @notice 按资产筛选vaults
     * @param asset 资产地址
     */
    function getVaultsByAsset(address asset)
        external
        view
        returns (address[] memory)
    {
        uint256 count = 0;

        // 计算匹配的vault数量
        for (uint256 i = 0; i < allVaults.length; i++) {
            if (vaultInfo[allVaults[i]].asset == asset &&
                vaultInfo[allVaults[i]].active) {
                count++;
            }
        }

        // 创建结果数组
        address[] memory matchingVaults = new address[](count);
        uint256 index = 0;

        for (uint256 i = 0; i < allVaults.length; i++) {
            if (vaultInfo[allVaults[i]].asset == asset &&
                vaultInfo[allVaults[i]].active) {
                matchingVaults[index] = allVaults[i];
                index++;
            }
        }

        return matchingVaults;
    }

    /**
     * @notice 提取factory中的ETH
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");

        (bool success, ) = owner().call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    /**
     * @notice 接收ETH
     */
    receive() external payable {}
}