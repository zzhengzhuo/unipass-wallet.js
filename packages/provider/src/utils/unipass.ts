import { providers } from "ethers";
import { GasEstimatingWallet, Wallet } from "@unipasswallet/wallet";
import { Keyset } from "@unipasswallet/keys";
import { RpcRelayer } from "@unipasswallet/relayer";
import { AuthChainNode, ChainType, Environment, UnipassWalletProps } from "../interface/unipassWalletProvider";
import { MAINNET_UNIPASS_WALLET_CONTEXT, TESTNET_UNIPASS_WALLET_CONTEXT } from "@unipasswallet/network";
import { dkimParams } from "@unipasswallet/sdk";
import { chain_config, dev_api_config, mainnet_api_config, testnet_api_config } from "../config/index";

const genUnipassWalletContext = (env: Environment) => {
  switch (env) {
    case "testnet":
      return TESTNET_UNIPASS_WALLET_CONTEXT;
    case "mainnet":
      return MAINNET_UNIPASS_WALLET_CONTEXT;
    default:
      return MAINNET_UNIPASS_WALLET_CONTEXT;
  }
};

const genProviders = (config: UnipassWalletProps) => {
  let polygon_url = "";
  let bsc_url = "";
  let rangers_url = "";
  let eth_url = "";
  switch (config.env) {
    case "testnet":
      eth_url = chain_config["eth-goerli"].rpc_url;
      polygon_url = chain_config["polygon-mumbai"].rpc_url;
      bsc_url = chain_config["bsc-testnet"].rpc_url;
      rangers_url = chain_config["rangers-robin"].rpc_url;
      break;
    case "mainnet":
      eth_url = chain_config["eth-mainnet"].rpc_url;
      polygon_url = chain_config["polygon-mainnet"].rpc_url;
      bsc_url = chain_config["bsc-mainnet"].rpc_url;
      rangers_url = chain_config["rangers-mainnet"].rpc_url;
      break;
    default:
      eth_url = chain_config["eth-mainnet"].rpc_url;
      polygon_url = chain_config["polygon-mainnet"].rpc_url;
      bsc_url = chain_config["bsc-mainnet"].rpc_url;
      rangers_url = chain_config["rangers-mainnet"].rpc_url;
  }
  const eth = new providers.JsonRpcProvider(eth_url);
  const polygon = new providers.JsonRpcProvider(polygon_url);
  const bsc = new providers.JsonRpcProvider(bsc_url);
  const rangers = new providers.JsonRpcProvider(rangers_url);
  return { polygon, bsc, rangers, eth };
};

const genRelayers = (
  config: UnipassWalletProps,
  ethProvider: providers.JsonRpcProvider,
  polygonProvider: providers.JsonRpcProvider,
  bcdProvider: providers.JsonRpcProvider,
  rangersProvider: providers.JsonRpcProvider,
) => {
  let relayer_config: { eth: string; bsc: string; polygon: string; rangers: string };
  const context = genUnipassWalletContext(config.env);

  switch (config.env) {
    case "testnet":
      relayer_config = {
        eth: testnet_api_config.relayer.eth,
        bsc: testnet_api_config.relayer.bsc,
        rangers: testnet_api_config.relayer.rangers,
        polygon: testnet_api_config.relayer.polygon,
      };
      break;
    case "mainnet":
      relayer_config = {
        eth: mainnet_api_config.relayer.eth,
        bsc: mainnet_api_config.relayer.bsc,
        rangers: mainnet_api_config.relayer.rangers,
        polygon: mainnet_api_config.relayer.polygon,
      };
      break;
    default:
      relayer_config = {
        eth: mainnet_api_config.relayer.eth,
        bsc: mainnet_api_config.relayer.bsc,
        rangers: mainnet_api_config.relayer.rangers,
        polygon: mainnet_api_config.relayer.polygon,
      };
  }
  relayer_config = config?.url_config?.relayer || relayer_config;

  const eth = new RpcRelayer(relayer_config.eth, context, ethProvider);
  const polygon = new RpcRelayer(relayer_config.polygon, context, polygonProvider);
  const bsc = new RpcRelayer(relayer_config.bsc, context, bcdProvider);
  const rangers = new RpcRelayer(relayer_config.rangers, context, rangersProvider);

  return { polygon, bsc, rangers, eth };
};
export class WalletsCreator {
  public static instance: WalletsCreator;

  public eth: Wallet;

  public polygon: Wallet;

  public bsc: Wallet;

  public rangers: Wallet;

  public ethGasEstimator: GasEstimatingWallet;

  public polygonGasEstimator: GasEstimatingWallet;

  public bscGasEstimator: GasEstimatingWallet;

  static getInstance(keyset: Keyset, address: string, config: UnipassWalletProps) {
    if (!WalletsCreator.instance) {
      const ins = new WalletsCreator(keyset, address, config);
      WalletsCreator.instance = ins;
    }
    WalletsCreator.instance.eth.address = address;
    WalletsCreator.instance.eth.keyset = keyset;

    WalletsCreator.instance.polygon.address = address;
    WalletsCreator.instance.polygon.keyset = keyset;

    WalletsCreator.instance.bsc.address = address;
    WalletsCreator.instance.bsc.keyset = keyset;

    WalletsCreator.instance.rangers.address = address;
    WalletsCreator.instance.rangers.keyset = keyset;

    return WalletsCreator.instance;
  }

  private constructor(keyset: Keyset, address: string, config: UnipassWalletProps) {
    const context = genUnipassWalletContext(config.env);
    const {
      eth: ethProvider,
      polygon: polygonProvider,
      bsc: bscProvider,
      rangers: rangersProvider,
    } = genProviders(config);
    const {
      eth: ethRelayer,
      polygon: polygonRelayer,
      bsc: bscRelayer,
      rangers: rangersRelayer,
    } = genRelayers(config, ethProvider, polygonProvider, bscProvider, rangersProvider);

    this.eth = Wallet.create({ address, keyset, provider: ethProvider, relayer: ethRelayer, context });
    this.polygon = Wallet.create({
      keyset,
      provider: polygonProvider,
      relayer: polygonRelayer,
      address,
    });
    this.bsc = Wallet.create({ address, keyset, provider: bscProvider, relayer: bscRelayer, context });
    this.rangers = Wallet.create({
      keyset,
      provider: rangersProvider,
      relayer: rangersRelayer,
      address,
      context,
    });

    this.ethGasEstimator = GasEstimatingWallet.create({
      address,
      keyset,
      emailType: dkimParams.EmailType.CallOtherContract,
      provider: ethProvider,
      relayer: ethRelayer,
      context,
    });
    this.bscGasEstimator = GasEstimatingWallet.create({
      address,
      keyset,
      emailType: dkimParams.EmailType.CallOtherContract,
      provider: bscProvider,
      relayer: bscRelayer,
      context,
    });
    this.polygonGasEstimator = GasEstimatingWallet.create({
      address,
      keyset,
      emailType: dkimParams.EmailType.CallOtherContract,
      provider: polygonProvider,
      relayer: polygonRelayer,
      context,
    });
  }

  static getPolygonProvider(keyset: Keyset, env: Environment): Wallet {
    let polygon_url = "";
    switch (env) {
      case "testnet":
        polygon_url = chain_config["polygon-mumbai"].rpc_url;
        break;
      case "mainnet":
        polygon_url = chain_config["polygon-mainnet"].rpc_url;
        break;
      default:
        polygon_url = chain_config["polygon-mainnet"].rpc_url;
    }
    return Wallet.create({
      keyset,
      provider: new providers.JsonRpcProvider(polygon_url),
    });
  }
}

export const getAuthNodeChain = (env: Environment, chainType: ChainType): AuthChainNode => {
  if (env === "testnet") {
    switch (chainType) {
      case "eth":
        return "eth-goerli";
      case "polygon":
        return "polygon-mumbai";
      case "bsc":
        return "bsc-testnet";
      case "rangers":
        return "rangers-robin";
      default:
        return "polygon-mumbai";
    }
  } else if (env === "mainnet") {
    switch (chainType) {
      case "eth":
        return "eth-mainnet";
      case "polygon":
        return "polygon-mainnet";
      case "bsc":
        return "bsc-mainnet";
      case "rangers":
        return "rangers-mainnet";
      default:
        return "polygon-mainnet";
    }
  }
};
