// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract StrategyManager is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant STRATEGIST_ROLE = keccak256("STRATEGIST_ROLE");

    struct StrategyInfo {
        address strategy;
        string name;
        string description;
        address[] protocols;
        uint256 riskScore;
        uint256 avgAPY;
        uint256 tvl;
        uint256 lastUpdate;
        bool active;
        bool verified;
    }

    mapping(address => StrategyInfo) public strategies;
    address[] public strategyList;
    mapping(address => bool) public whitelistedProtocols;
    mapping(address => uint256[]) public scoreHistory;

    uint256[42] private __gap;

    event StrategyRegistered(address indexed strategy, string name);
    event StrategyUpdated(address indexed strategy);
    event StrategyVerified(address indexed strategy);
    event StrategyDeactivated(address indexed strategy);
    event RiskScoreUpdated(address indexed strategy, uint256 newScore);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) public initializer {
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    function registerStrategy(
        address strategy,
        string memory name,
        string memory description,
        address[] memory protocols,
        uint256 riskScore
    ) external onlyRole(STRATEGIST_ROLE) {
        require(strategy != address(0), "Invalid strategy");
        require(!strategies[strategy].active, "Strategy exists");
        require(riskScore <= 100, "Invalid risk score");

        for (uint256 i = 0; i < protocols.length; i++) {
            require(
                whitelistedProtocols[protocols[i]],
                "Protocol not whitelisted"
            );
        }

        strategies[strategy] = StrategyInfo({
            strategy: strategy,
            name: name,
            description: description,
            protocols: protocols,
            riskScore: riskScore,
            avgAPY: 0,
            tvl: 0,
            lastUpdate: block.timestamp,
            active: true,
            verified: false
        });

        strategyList.push(strategy);
        scoreHistory[strategy].push(riskScore);

        emit StrategyRegistered(strategy, name);
    }

    function updateStrategy(
        address strategy,
        uint256 avgAPY,
        uint256 tvl
    ) external onlyRole(STRATEGIST_ROLE) {
        require(strategies[strategy].active, "Strategy not active");

        StrategyInfo storage info = strategies[strategy];
        info.avgAPY = avgAPY;
        info.tvl = tvl;
        info.lastUpdate = block.timestamp;

        emit StrategyUpdated(strategy);
    }

    function updateRiskScore(address strategy, uint256 newScore)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(strategies[strategy].active, "Strategy not active");
        require(newScore <= 100, "Invalid score");

        strategies[strategy].riskScore = newScore;
        scoreHistory[strategy].push(newScore);

        emit RiskScoreUpdated(strategy, newScore);
    }

    function verifyStrategy(address strategy)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(strategies[strategy].active, "Strategy not active");
        strategies[strategy].verified = true;
        emit StrategyVerified(strategy);
    }

    function deactivateStrategy(address strategy)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(strategies[strategy].active, "Already inactive");
        strategies[strategy].active = false;
        emit StrategyDeactivated(strategy);
    }

    function whitelistProtocol(address protocol)
        external
        onlyRole(ADMIN_ROLE)
    {
        whitelistedProtocols[protocol] = true;
    }

    function getActiveStrategies()
        external
        view
        returns (address[] memory)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < strategyList.length; i++) {
            if (strategies[strategyList[i]].active) {
                count++;
            }
        }

        address[] memory active = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < strategyList.length; i++) {
            if (strategies[strategyList[i]].active) {
                active[index++] = strategyList[i];
            }
        }

        return active;
    }

    function getVerifiedStrategies()
        external
        view
        returns (address[] memory)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < strategyList.length; i++) {
            if (strategies[strategyList[i]].verified) {
                count++;
            }
        }

        address[] memory verified = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < strategyList.length; i++) {
            if (strategies[strategyList[i]].verified) {
                verified[index++] = strategyList[i];
            }
        }

        return verified;
    }

    function getStrategiesByRisk(uint256 maxRisk)
        external
        view
        returns (address[] memory)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < strategyList.length; i++) {
            StrategyInfo memory info = strategies[strategyList[i]];
            if (info.active && info.riskScore <= maxRisk) {
                count++;
            }
        }

        address[] memory filtered = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < strategyList.length; i++) {
            StrategyInfo memory info = strategies[strategyList[i]];
            if (info.active && info.riskScore <= maxRisk) {
                filtered[index++] = strategyList[i];
            }
        }

        return filtered;
    }

    function getScoreHistory(address strategy)
        external
        view
        returns (uint256[] memory)
    {
        return scoreHistory[strategy];
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(ADMIN_ROLE)
    {}
}