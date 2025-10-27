// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title CrossChainBridge
 * @notice 跨链桥接 - 支持资产在多链间转移
 */
contract CrossChainBridge is AccessControl, ReentrancyGuard {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");

    uint256 public nonce;
    uint256 public minValidators = 2;

    struct Transfer {
        address token;
        address from;
        address to;
        uint256 amount;
        uint256 fromChainId;
        uint256 toChainId;
        uint256 nonce;
        bytes32 txHash;
        TransferStatus status;
    }

    enum TransferStatus {
        Pending,
        Validated,
        Completed,
        Cancelled
    }

    mapping(bytes32 => Transfer) public transfers;
    mapping(bytes32 => mapping(address => bool)) public validatorSignatures;
    mapping(bytes32 => uint256) public signatureCount;

    // 支持的链ID和代币映�?
    mapping(uint256 => bool) public supportedChains;
    mapping(address => mapping(uint256 => address)) public tokenMappings; // token => chainId => remoteToken

    event TransferInitiated(
        bytes32 indexed transferId,
        address indexed token,
        address indexed from,
        address to,
        uint256 amount,
        uint256 toChainId
    );

    event TransferValidated(
        bytes32 indexed transferId,
        address indexed validator
    );

    event TransferCompleted(
        bytes32 indexed transferId,
        address indexed to,
        uint256 amount
    );

    event TransferCancelled(bytes32 indexed transferId);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        supportedChains[block.chainid] = true;
    }

    /**
     * @notice 发起跨链转账
     */
    function initiateTransfer(
        address token,
        address to,
        uint256 amount,
        uint256 toChainId
    ) external nonReentrant returns (bytes32 transferId) {
        require(supportedChains[toChainId], "Chain not supported");
        require(tokenMappings[token][toChainId] != address(0), "Token not mapped");
        require(amount > 0, "Invalid amount");

        // 锁定代币
        IERC20(token).transferFrom(msg.sender, address(this), amount);

        // 生成转账ID
        transferId = keccak256(
            abi.encodePacked(
                token,
                msg.sender,
                to,
                amount,
                block.chainid,
                toChainId,
                nonce++
            )
        );

        transfers[transferId] = Transfer({
            token: token,
            from: msg.sender,
            to: to,
            amount: amount,
            fromChainId: block.chainid,
            toChainId: toChainId,
            nonce: nonce - 1,
            txHash: bytes32(0),
            status: TransferStatus.Pending
        });

        emit TransferInitiated(
            transferId,
            token,
            msg.sender,
            to,
            amount,
            toChainId
        );
    }

    /**
     * @notice 验证器签名验证转�?
     */
    function validateTransfer(bytes32 transferId, bytes32 txHash)
    external
    onlyRole(VALIDATOR_ROLE)
    {
        Transfer storage transfer = transfers[transferId];
        require(transfer.status == TransferStatus.Pending, "Invalid status");
        require(
            !validatorSignatures[transferId][msg.sender],
            "Already validated"
        );

        validatorSignatures[transferId][msg.sender] = true;
        signatureCount[transferId]++;

        if (transfer.txHash == bytes32(0)) {
            transfer.txHash = txHash;
        }

        emit TransferValidated(transferId, msg.sender);

        // 达到最小验证数，标记为已验�?
        if (signatureCount[transferId] >= minValidators) {
            transfer.status = TransferStatus.Validated;
        }
    }

    /**
     * @notice 完成跨链转账(在目标链上调�?
     */
    function completeTransfer(
        bytes32 transferId,
        address token,
        address to,
        uint256 amount,
        uint256 fromChainId
    ) external onlyRole(RELAYER_ROLE) nonReentrant {
        require(supportedChains[fromChainId], "Chain not supported");

        Transfer storage transfer = transfers[transferId];

        // 如果是新转账，创建记�?
        if (transfer.from == address(0)) {
            transfer.token = token;
            transfer.to = to;
            transfer.amount = amount;
            transfer.fromChainId = fromChainId;
            transfer.toChainId = block.chainid;
            transfer.status = TransferStatus.Validated;
        }

        require(transfer.status == TransferStatus.Validated, "Not validated");

        // 释放或铸造代�?
        IERC20(token).transfer(to, amount);

        transfer.status = TransferStatus.Completed;

        emit TransferCompleted(transferId, to, amount);
    }

    /**
     * @notice 取消转账并退�?
     */
    function cancelTransfer(bytes32 transferId)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        Transfer storage transfer = transfers[transferId];
        require(transfer.status == TransferStatus.Pending, "Cannot cancel");

        // 退�?
        IERC20(transfer.token).transfer(transfer.from, transfer.amount);

        transfer.status = TransferStatus.Cancelled;

        emit TransferCancelled(transferId);
    }

    /**
     * @notice 添加支持的链
     */
    function addSupportedChain(uint256 chainId)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        supportedChains[chainId] = true;
    }

    /**
     * @notice 映射代币到其他链
     */
    function mapToken(
        address localToken,
        uint256 chainId,
        address remoteToken
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        tokenMappings[localToken][chainId] = remoteToken;
    }

    /**
     * @notice 设置最小验证器数量
     */
    function setMinValidators(uint256 _minValidators)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_minValidators > 0, "Invalid count");
        minValidators = _minValidators;
    }

    /**
     * @notice 紧急提取资�?
     */
    function emergencyWithdraw(address token, uint256 amount)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    {
        IERC20(token).transfer(msg.sender, amount);
    }
}
