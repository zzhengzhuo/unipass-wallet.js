import { BytesLike, constants } from "ethers";
import { keccak256, solidityPack } from "ethers/lib/utils";
import { AccountLayerActionType } from ".";
import { RoleWeight } from "../key";
import { CallType, Transaction } from "../transaction";
import { BaseTxBuilder } from "./baseTxBuilder";

export class UpdateTimeLockDuringTxBuilder extends BaseTxBuilder {
  public readonly OWNER_THRESHOLD = 100;

  constructor(
    public userAddr: BytesLike,
    public metaNonce: number,
    public timeLockDuring: number,
    public signature: string | undefined = undefined
  ) {
    super();
  }

  /**
   *
   * @returns The Original Message For Signing
   */
  public digestMessage(): string {
    return keccak256(
      solidityPack(
        ["uint32", "address", "uint8", "uint32"],
        [
          this.metaNonce,
          this.userAddr,
          AccountLayerActionType.UpdateTimeLockDuring,
          this.timeLockDuring,
        ]
      )
    );
  }

  validateRoleWeight(roleWeight: RoleWeight): boolean {
    return roleWeight.ownerWeight >= this.OWNER_THRESHOLD;
  }

  public build(): Transaction {
    const data = this.contractInterface.encodeFunctionData(
      "updateTimeLockDuring",
      [this.metaNonce, this.timeLockDuring, this.signature]
    );
    return {
      callType: CallType.Call,
      gasLimit: constants.Zero,
      target: this.userAddr,
      value: constants.Zero,
      data,
    };
  }
}
