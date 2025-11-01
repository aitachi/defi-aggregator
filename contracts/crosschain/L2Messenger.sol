// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title L2Messenger
 * @notice Layer2跨链消息传递 - 支持Arbitrum/Optimism
 */
contract L2Messenger is Ownable {
    // Arbitrum桥接地址
    address public constant ARB_SYS = address(100);

    // Optimism桥接地址
    address public constant L2_CROSS_DOMAIN_MESSENGER =
    0x4200000000000000000000000000000000000007;

    enum ChainType { Arbitrum, Optimism, Polygon }

    struct CrossChainMessage {
        address sender;
        address target;
        uint256 value;
        bytes data;
        uint256 gasLimit;
    }

    mapping(uint256 => ChainType) public chainTypes;
    mapping(bytes32 => bool) public processedMessages;

    event MessageSent(
        uint256 indexed destChain,
        address indexed sender,
        address indexed target,
        bytes32 messageHash
    );

    event MessageReceived(
        uint256 indexed srcChain,
        address indexed sender,
        bytes32 messageHash
    );

    constructor() Ownable(msg.sender) {
        // 配置链类型
        chainTypes[42161] = ChainType.Arbitrum;  // Arbitrum One
        chainTypes[10] = ChainType.Optimism;     // Optimism
        chainTypes[137] = ChainType.Polygon;     // Polygon
    }

    /**
     * @notice 发送跨链消息
     */
    function sendCrossChainMessage(
        uint256 destChainId,
        address target,
        bytes calldata data,
        uint256 gasLimit
    ) external payable returns (bytes32 messageHash) {
        ChainType chainType = chainTypes[destChainId];

        CrossChainMessage memory message = CrossChainMessage({
            sender: msg.sender,
            target: target,
            value: msg.value,
            data: data,
            gasLimit: gasLimit
        });

        messageHash = keccak256(abi.encode(message, block.timestamp));

        if (chainType == ChainType.Arbitrum) {
            _sendToArbitrum(target, data, gasLimit);
        } else if (chainType == ChainType.Optimism) {
            _sendToOptimism(target, data, gasLimit);
        } else {
            revert("Unsupported chain");
        }

        emit MessageSent(destChainId, msg.sender, target, messageHash);
    }

    /**
     * @notice 接收跨链消息
     */
    function receiveCrossChainMessage(
        uint256 srcChainId,
        address sender,
        bytes calldata data
    ) external {
        // 验证调用者是桥接合约
        require(_isBridgeContract(msg.sender), "Not bridge contract");

        bytes32 messageHash = keccak256(abi.encode(sender, data, block.timestamp));
        require(!processedMessages[messageHash], "Message already processed");

        processedMessages[messageHash] = true;

        // 执行消息
        (bool success, ) = address(this).call(data);
        require(success, "Message execution failed");

        emit MessageReceived(srcChainId, sender, messageHash);
    }

    function _sendToArbitrum(
        address target,
        bytes memory data,
        uint256 /* gasLimit */
    ) internal {
        // Arbitrum使用ArbSys发送L2->L1消息
        IArbSys(ARB_SYS).sendTxToL1{value: msg.value}(target, data);
    }

    function _sendToOptimism(
        address target,
        bytes memory data,
        uint256 gasLimit
    ) internal {
        // Optimism使用CrossDomainMessenger
        IL2CrossDomainMessenger(L2_CROSS_DOMAIN_MESSENGER).sendMessage{
                value: msg.value
            }(target, data, uint32(gasLimit));
    }

    function _isBridgeContract(address addr) internal pure returns (bool) {
        return addr == ARB_SYS || addr == L2_CROSS_DOMAIN_MESSENGER;
    }

    function addChainType(uint256 chainId, ChainType chainType)
    external
    onlyOwner
    {
        chainTypes[chainId] = chainType;
    }
}

interface IArbSys {
    function sendTxToL1(address destination, bytes calldata data)
    external
    payable
    returns (uint256);
}

interface IL2CrossDomainMessenger {
    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _gasLimit
    ) external payable;
}