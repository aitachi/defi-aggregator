import { ethers } from "hardhat";

async function main() {
    console.log("🚀 Deploying Principal and Yield Tokens...\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

    // Deploy Mock USDC (for testing)
    console.log("📄 Deploying Mock USDC...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("Mock USDC", "USDC", 6);
    await usdc.waitForDeployment();
    const usdcAddress = await usdc.getAddress();
    console.log("✅ Mock USDC deployed to:", usdcAddress, "\n");

    // Deploy Vault
    console.log("📄 Deploying Vault...");
    const Vault = await ethers.getContractFactory("Vault");
    const vault = await Vault.deploy();
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();
    console.log("✅ Vault deployed to:", vaultAddress, "\n");

    // Add USDC to vault
    console.log("🔧 Adding USDC to vault...");
    await vault.addToken(usdcAddress);
    console.log("✅ USDC added to vault\n");

    // Set maturity date (90 days from now)
    const maturityDate = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

    // Deploy Principal Token
    console.log("📄 Deploying Principal Token...");
    const PrincipalToken = await ethers.getContractFactory("PrincipalToken");
    const principalToken = await PrincipalToken.deploy(
        "Principal USDC 90D",
        "PT-USDC-90D",
        usdcAddress,
        maturityDate
    );
    await principalToken.waitForDeployment();
    const ptAddress = await principalToken.getAddress();
    console.log("✅ Principal Token deployed to:", ptAddress, "\n");

    // Deploy Yield Token
    console.log("📄 Deploying Yield Token...");
    const YieldToken = await ethers.getContractFactory("YieldToken");
    const yieldToken = await YieldToken.deploy(
        "Yield USDC 90D",
        "YT-USDC-90D",
        usdcAddress,
        vaultAddress,
        maturityDate
    );
    await yieldToken.waitForDeployment();
    const ytAddress = await yieldToken.getAddress();
    console.log("✅ Yield Token deployed to:", ytAddress, "\n");

    // Link tokens
    console.log("🔧 Linking Principal and Yield Tokens...");
    await yieldToken.setPrincipalToken(ptAddress);
    console.log("✅ Tokens linked\n");

    // Summary
    console.log("=" .repeat(60));
    console.log("📊 DEPLOYMENT SUMMARY");
    console.log("=" .repeat(60));
    console.log("Mock USDC:       ", usdcAddress);
    console.log("Vault:           ", vaultAddress);
    console.log("Principal Token: ", ptAddress);
    console.log("Yield Token:     ", ytAddress);
    console.log("Maturity Date:   ", new Date(maturityDate * 1000).toLocaleDateString());
    console.log("=" .repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });