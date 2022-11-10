import { AccountInfo, AuditStatus, SignType } from "./interface/index";
import { arrayify, keccak256, parseEther, toUtf8Bytes } from "ethers/lib/utils";
import { BigNumber, constants, ethers } from "ethers";
import { ExecuteTransaction, BundledTransaction, isBundledTransaction } from "@unipasswallet/wallet";
import { Keyset } from "@unipasswallet/keys";
import { digestTxHash, Transaction, Transactionish } from "@unipasswallet/transactions";
import { CallTxBuilder } from "@unipasswallet/transaction-builders";
import api from "./api/backend";
import { checkEmailFormat } from "./utils/rules";
import { SyncStatusEnum } from "./interface";
import WalletError from "./constant/error_map";
// import DB from "./utils/db";
import {
  ChainType,
  Environment,
  TransactionFee,
  UnipassWalletProps,
  UniTransaction,
} from "./interface/unipassWalletProvider";
import { WalletsCreator, getAuthNodeChain } from "./utils/unipass";
import { ADDRESS_ZERO } from "./constant";
import { FeeOption, Relayer } from "@unipasswallet/relayer";
import { getAccountInfo } from "./utils/storages";

const checkAccountStatus = async (email: string, chainType: ChainType, env: Environment) => {
  checkEmailFormat(email);
  const {
    data: { syncStatus },
  } = await api.accountStatus({
    email,
    authChainNode: getAuthNodeChain(env, chainType),
  });
  return syncStatus;
};

export type OperateTransaction = {
  deployTx?: Transaction;
  syncAccountTx?: ExecuteTransaction;
  transaction: Transaction;
};

export const innerGenerateTransferTx = async (
  tx: UniTransaction,
  chainType: ChainType,
  config: UnipassWalletProps,
): Promise<OperateTransaction> => {
  const user = await getUser();

  let deployTx: Transaction;
  let syncAccountTx: ExecuteTransaction;
  const preSignFunc = async (chainId: number, address: string, txs: Transaction[], nonce: BigNumber) => {
    const {
      data: { approveStatus },
    } = await api.tssAudit({
      type: SignType.PersonalSign,
      content: JSON.stringify({
        chainId,
        address,
        txs,
        nonce: nonce.toNumber(),
      }),
      msg: digestTxHash(chainId, address, nonce.toNumber(), txs),
    });
    return approveStatus === AuditStatus.Approved;
  };
  if (chainType !== "polygon") {
    const syncStatus = await checkAccountStatus(user.email, chainType, config.env);
    if (syncStatus === SyncStatusEnum.ServerSynced) {
      const {
        data: { transactions = [], isNeedDeploy },
      } = await api.syncTransaction({
        email: user.email,
        authChainNode: getAuthNodeChain(config.env, chainType),
      });
      transactions.forEach((v, i) => {
        transactions[i] = { ...v, gasLimit: BigNumber.from(v.gasLimit._hex), value: BigNumber.from(v.value._hex) };
      });
      if (transactions.length === 1) {
        if (isNeedDeploy) {
          transactions[0].gasLimit = constants.Zero;
          transactions[0].revertOnError = true;
          [deployTx] = transactions;
        } else {
          syncAccountTx = {
            type: "Execute",
            transactions,
            sessionKeyOrSignerIndex: [],
            gasLimit: constants.Zero,
            preSignFunc,
          };
        }
      } else if (transactions.length === 2) {
        transactions[0].gasLimit = constants.Zero;
        transactions[1].gasLimit = constants.Zero;
        transactions[0].revertOnError = true;
        transactions[1].revertOnError = true;
        [deployTx] = transactions;
        syncAccountTx = {
          type: "Execute",
          transactions: transactions[1],
          sessionKeyOrSignerIndex: [],
          gasLimit: constants.Zero,
          preSignFunc,
        };
      }
    }
    if (syncStatus === SyncStatusEnum.NotReceived) {
      throw new WalletError(403001);
    } else if (syncStatus === SyncStatusEnum.NotSynced) {
      throw new WalletError(403001);
    }
  }
  const { revertOnError = true, gasLimit = BigNumber.from("0"), target, value, data = "0x00" } = tx;

  const transaction = new CallTxBuilder(revertOnError, gasLimit, target, value, data).build();

  return { deployTx, syncAccountTx, transaction };
};

export const getFeeTx = (to: string, feeToken: string, feeValue: BigNumber) => {
  let feeTx: Transaction;

  if (feeToken !== ADDRESS_ZERO) {
    const erc20Interface = new ethers.utils.Interface(["function transfer(address _to, uint256 _value)"]);
    const tokenData = erc20Interface.encodeFunctionData("transfer", [to, feeValue]);
    feeTx = new CallTxBuilder(true, BigNumber.from(0), feeToken, BigNumber.from(0), tokenData).build();
  } else {
    feeTx = new CallTxBuilder(true, BigNumber.from(0), to, feeValue, "0x").build();
  }
  return feeTx;
};

export const getFeeTxByGasLimit = async (feeToken: string, gasLimit: BigNumber, relayer: Relayer) => {
  const feeOption = await getFeeOption(gasLimit, feeToken, relayer);
  const { to: receiver, amount: feeAmount } = feeOption as FeeOption;
  const feeTx = getFeeTx(receiver, feeToken, BigNumber.from(feeAmount));

  return feeTx;
};

export const getFeeOption = async (
  gasLimit: BigNumber,
  token: string,
  relayer: Relayer,
): Promise<FeeOption | Pick<FeeOption, "to">> => {
  const feeOptions = await relayer.getFeeOptions(gasLimit.toHexString());
  let feeOption: FeeOption | Pick<FeeOption, "to">;
  if (token === ADDRESS_ZERO) {
    feeOption = feeOptions.options.find(
      (x) =>
        !(x as FeeOption).token.contractAddress ||
        (x as FeeOption).token.contractAddress.toLowerCase() === token.toLowerCase(),
    );
  } else {
    feeOption = feeOptions.options.find(
      (x) =>
        !!(x as FeeOption).token.contractAddress &&
        (x as FeeOption).token.contractAddress.toLowerCase() === token.toLowerCase(),
    );
  }
  if (!feeOption) throw new Error(`un supported fee token ${token}`);

  return feeOption;
};

export const innerEstimateTransferGas = async (
  tx: OperateTransaction,
  chainType: ChainType,
  config: UnipassWalletProps,
  fee?: TransactionFee,
  gasLimit?: BigNumber,
): Promise<ExecuteTransaction | BundledTransaction> => {
  const user = await getUser();
  const keyset = Keyset.fromJson(user.keyset.keysetJson);
  const instance = WalletsCreator.getInstance(keyset, user.address, config);
  const wallet = instance[chainType];
  const gasEstimator = instance[`${chainType}GasEstimator`];
  const nonce = await wallet.relayer.getNonce(wallet.address);

  const { deployTx, syncAccountTx } = tx;
  const { transaction } = tx;

  let feeValue: BigNumber | undefined;
  let feeTx: Transaction;
  if (fee) {
    const { token, value: tokenValue } = fee;
    if (tokenValue.eq(0)) {
      feeValue = tokenValue;
      feeTx = await getFeeTxByGasLimit(token, constants.One, wallet.relayer);
    } else {
      const feeOption = await getFeeOption(constants.One, token, wallet.relayer);
      const { to } = feeOption as FeeOption;
      feeTx = getFeeTx(to, token, tokenValue);
    }
  }

  let transferExecuteTx: ExecuteTransaction;
  if (!feeTx) {
    transferExecuteTx = {
      type: "Execute",
      transactions: [transaction],
      gasLimit: constants.Zero,
      sessionKeyOrSignerIndex: [0],
    };
  } else {
    transferExecuteTx = {
      type: "Execute",
      transactions: [transaction, feeTx],
      gasLimit: constants.Zero,
      sessionKeyOrSignerIndex: [0],
    };
  }

  let estimatedTxs;
  if (deployTx) {
    estimatedTxs = { type: "Bundled", transactions: [deployTx], gasLimit: constants.Zero };
  }
  if (syncAccountTx) {
    if (estimatedTxs) {
      estimatedTxs.transactions.push(syncAccountTx);
    } else {
      estimatedTxs = { type: "Bundled", transactions: [syncAccountTx], gasLimit: constants.Zero };
    }
  }

  if (estimatedTxs) {
    estimatedTxs.transactions.push(transferExecuteTx);
  } else {
    estimatedTxs = transferExecuteTx;
  }

  if (!gasLimit) {
    if (chainType === "rangers") {
      gasLimit = parseEther("0.001");
    } else if (isBundledTransaction(estimatedTxs)) {
      estimatedTxs = await gasEstimator.estimateBundledTxGasLimits(estimatedTxs, nonce);
      gasLimit = estimatedTxs.gasLimit;
    } else {
      estimatedTxs = await gasEstimator.estimateExecuteTxsGasLimits(estimatedTxs, nonce);
      gasLimit = estimatedTxs.gasLimit;
    }
  } else {
    estimatedTxs.gasLimit = gasLimit;
  }

  if (feeValue && feeValue.eq(0)) {
    feeTx = await getFeeTxByGasLimit(fee.token, gasLimit, wallet.relayer!);
    transferExecuteTx.transactions[(transferExecuteTx.transactions as Transactionish[]).length - 1] = feeTx;
    if (isBundledTransaction(estimatedTxs)) {
      (estimatedTxs.transactions as (ExecuteTransaction | Transactionish)[])[
        (estimatedTxs.transactions as (ExecuteTransaction | Transactionish)[]).length - 1
      ] = transferExecuteTx;
    } else {
      transferExecuteTx.gasLimit = gasLimit;
      estimatedTxs = transferExecuteTx;
    }
  }
  return estimatedTxs;
};

export const sendTransaction = async (
  tx: ExecuteTransaction | BundledTransaction,
  chainType: ChainType,
  config: UnipassWalletProps,
  keyset: Keyset,
  feeToken?: string,
  timeout?: number,
) => {
  const user = await getUser();

  const instance = WalletsCreator.getInstance(keyset, user.address, config);
  const wallet = instance[chainType];

  const ret = await ((await wallet.sendTransaction(tx, [0], feeToken, tx.gasLimit)).wait as any)(1, timeout);
  return ret;
};

const genSignMessage = async (message: string, config: UnipassWalletProps) => {
  const user = await getUser();
  const keyset = Keyset.fromJson(user.keyset.keysetJson);
  const wallet = WalletsCreator.getInstance(keyset, user.address, config).polygon;
  const signedMessage = await wallet.signMessage(arrayify(keccak256(toUtf8Bytes(message))), [0]);
  return signedMessage;
};

const verifySignature = async (message: string, sig: string, config: UnipassWalletProps) => {
  const user = await getUser();
  const keyset = Keyset.fromJson(user.keyset.keysetJson);
  const wallet = WalletsCreator.getInstance(keyset, user.address, config).polygon;
  const signedMessage = await wallet.isValidSignature(arrayify(keccak256(toUtf8Bytes(message))), sig);
  return signedMessage;
};

const getWallet = async (config: UnipassWalletProps, chainType: ChainType) => {
  const user = await getUser();
  const keyset = Keyset.fromJson(user.keyset.keysetJson);
  const wallet = WalletsCreator.getInstance(keyset, user.address, config)[chainType];
  return wallet;
};

const checkLocalStatus = async (config: UnipassWalletProps) => {
  try {
    const user = await getUser();
    const keyset = Keyset.fromJson(user.keyset.keysetJson);
    const wallet = WalletsCreator.getInstance(keyset, user.address, config).polygon;
    const isLogged = await wallet.isSyncKeysetHash();
    if (isLogged) {
      return user.email;
    }
    // await DB.delUser(user.email);
  } catch (err) {
    if (err instanceof WalletError && (err.code === 403002 || err.code === 402007)) return false;

    throw err;
  }
};

const getUser = async (): Promise<AccountInfo | undefined> => {
  const accountInfo = getAccountInfo();
  if (accountInfo) {
    return accountInfo;
  }
  throw new WalletError(402007);
};

export { genSignMessage, checkLocalStatus, verifySignature, getWallet };
