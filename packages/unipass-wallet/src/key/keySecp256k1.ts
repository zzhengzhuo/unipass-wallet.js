import { KeyBase } from "./keyBase";
import { BytesLike, utils } from "ethers";
import { KeyType, RoleWeight, SignFlag, SignType } from ".";

export class KeySecp256k1 extends KeyBase {
  constructor(
    public readonly address: BytesLike,
    roleWeight: RoleWeight,
    private _signType: SignType,
    public readonly signFunc: (
      digestHash: BytesLike,
      signType: SignType
    ) => Promise<string>
  ) {
    super(roleWeight);
  }

  public get signType(): SignType {
    return this._signType;
  }

  public set signType(v: SignType) {
    this._signType = v;
  }

  public async generateSignature(digestHash: string): Promise<string> {
    return utils.solidityPack(
      ["uint8", "uint8", "bytes", "bytes"],
      [
        KeyType.Secp256k1,
        SignFlag.Sign,
        await this.signFunc(digestHash, this.signType),
        this.serializeRoleWeight(),
      ]
    );
  }

  public generateKey(): string {
    return utils.solidityPack(
      ["uint8", "uint8", "address", "bytes"],
      [
        KeyType.Secp256k1,
        SignFlag.NotSign,
        this.address,
        this.serializeRoleWeight(),
      ]
    );
  }

  public serialize(): string {
    return utils.solidityPack(
      ["uint8", "address", "bytes"],
      [KeyType.Secp256k1, this.address, this.serializeRoleWeight()]
    );
  }
}
