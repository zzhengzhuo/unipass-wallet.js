export interface UnipassWalletContext {
  moduleMain: string;
  moduleMainUpgradable: string;
  moduleGuest?: string;

  dkimKeys?: string;
  moduleWhiteList?: string;
}

export const unipassWalletContext: UnipassWalletContext = {
  moduleMain: "0xFF428D8f2af3776c60B55f987b9b725E053B7146",
  moduleMainUpgradable: "0xFffb928bFdE886685AEBECC1E8C2c84174d49AC3",
  moduleGuest: "0xe989fA8687D049134FA7dfC6FD6752092FEE9567",

  dkimKeys: "0xC8210aD539Eedfe3D374D4363722A999FB15d166",
  moduleWhiteList: "0x65E295742466499530029915195FEFeA3623c038",
};
