import { usePathname } from "next/navigation";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import {
  ACTA_API_KEY,
  ACTA_BASE_URL,
  generateExecutionTimes,
  PAYMASTER_ADDRESS,
  PAYMASTER_URL,
} from "../../utils";
import {
  useAccount,
  useClient,
  useConnect,
  useDisconnect,
  useReadContract,
  useSendTransaction,
} from "wagmi";
import {
  useActaAccount,
  useFees,
  useMerkleSignUserOps,
  useSalt,
} from "@actalink/react-hooks";
import { config } from "../../wagmi";
import {
  Address,
  encodeFunctionData,
  encodePacked,
  erc20Abi,
  getAddress,
  parseUnits,
  PublicClient,
} from "viem";
import { UserOperation } from "viem/account-abstraction";
import { createTransferCallData } from "@actalink/modules";
import { toSignedPaymasterData } from "@actalink/sdk";
import { v4 as uuidv4 } from "uuid";
import { readContract } from "viem/actions";
import {
  additionalValidatorAddresses,
  defaultValidatorAddresses,
} from "../../constants";
import { injected } from "wagmi/connectors";
import { IoPower } from "react-icons/io5";

interface IPlan {
  planId: string;
  amount: string;
  frequency: string;
  volume: number;
}

function getDefaultUserOp(): UserOperation<"0.7"> {
  return {
    sender: "0x0000000000000000000000000000000000000000",
    nonce: 0n,
    callGasLimit: 2n * 10n ** 6n,
    callData: "0x",
    maxPriorityFeePerGas: 2n * 10n ** 6n,
    maxFeePerGas: 2n * 10n ** 6n,
    preVerificationGas: 2n * 10n ** 6n,
    signature: "0x",
    verificationGasLimit: 2n * 10n ** 6n,
  };
}

export default function CheckoutSession() {
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { address: eoaAddress, status: eoaStatus, chainId } = useAccount();
  const defaultValidator = defaultValidatorAddresses[chainId ?? 137];
  const addValidators = additionalValidatorAddresses[chainId ?? 137]
    .split(",")
    .map((v) => getAddress(v.trim()));

  const validators = [defaultValidator, ...addValidators];

  const publicClient = useClient() as PublicClient;
  const {
    address: swAddress,
    status: swStatus,
    actaAccount,
  } = useActaAccount({ eoaAddress, eoaStatus, chainId, config, validators });
  const { calculateActaFees, getActaFeesRecipients, getPaymasterfees } =
    useFees({ config });
  const { salt } = useSalt({ eoaAddress, eoaStatus, config });
  const { sendTransactionAsync } = useSendTransaction();
  const { createERC20Transfer } = useMerkleSignUserOps({
    eoaAddress: eoaAddress,
    config,
  });
  const path = usePathname();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [plan, setPlan] = useState<IPlan>({
    planId: "",
    frequency: "",
    amount: "",
    volume: 0,
  });
  const [isApprovalRequired, setIsApprovalRequired] = useState<boolean>(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState<boolean>(false);

  async function getCheckoutSessionData(ssnId: string): Promise<any> {
    const res = await fetch(
      `${ACTA_BASE_URL}/checkout-session?sessionId=${ssnId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ACTA_API_KEY,
        },
      }
    );
    const jsonRes = await res.json();

    return jsonRes;
  }

  useEffect(() => {
    const createCheckout = async () => {
      if (path !== null) {
        const sessionId = path.split("/");
        const session = await getCheckoutSessionData(sessionId[2]);
        setSessionId(sessionId[2]);
        setDetails(session.data);
      }
    };
    createCheckout();
  }, [path]);

  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      const res = await fetch(
        `${ACTA_BASE_URL}/subscriptionstatus?address=${eoaAddress}&subscriptionId=${details.subscription.id}`,
        {
          method: "GET",
        }
      );
      const jsonRes = await res.json();
      setSubscriptionStatus(jsonRes.status);
    };
    if (details && eoaAddress) {
      fetchSubscriptionStatus();
    }
  }, [eoaAddress, details]);

  useEffect(() => {
    const updateNetwork = async () => {
      if (eoaAddress !== undefined && chainId !== undefined) {
        await fetch(`${ACTA_BASE_URL}/paymentmethod`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ACTA_API_KEY,
          },
          body: JSON.stringify({
            method: "network",
            data: { network: chainId },
            sessionId: sessionId,
          }),
        });
      }
    };
    if (sessionId) {
      updateNetwork();
    }
  }, [eoaAddress, chainId, sessionId]);

  useEffect(() => {
    console.log(`plan: ${JSON.stringify(plan)}`);
    if (!swAddress) return;
    const checkAllowance = async () => {
      if (plan.planId.length > 0) {
        const allowance = await readContract(publicClient, {
          account: eoaAddress,
          address: details.subscription.tokens[0].address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [eoaAddress as Address, swAddress as Address],
        });
        const usdcAmount = parseUnits(
          plan.amount,
          details.subscription.tokens[0].decimals
        );
        const actaFees = await calculateActaFees(usdcAmount, validators[0]);
        const paymasterFees = await getPaymasterfees(validators[0]);
        const totalAllowanceRequired =
          (usdcAmount + actaFees + paymasterFees) * BigInt(plan.volume);
        console.log(`allowance: ${allowance}`);
        console.log(`required allowance: ${totalAllowanceRequired}`);
        if (allowance >= totalAllowanceRequired) {
          setIsApprovalRequired(false);
        }
      }
    };
    checkAllowance();
  }, [plan, swAddress]);

  const getValidatorForNonce = async () => {
    const res = await fetch(
      `${PAYMASTER_URL}/api/getPendingNonceKeys?smartWalletAddress=${swAddress}`,
      {
        method: "GET",
      }
    );
    let usedValidators: Array<Address> = [];
    if (res.status === 200) {
      const jsonRes = await res.json();
      usedValidators = jsonRes.map((val: Address) => {
        return getAddress(val);
      });
      console.log(usedValidators);
    }
    if (usedValidators.length === 0) return validators[0];

    const unusedValidators = validators.filter(
      (validator) => !usedValidators.includes(validator)
    );
    console.log(unusedValidators);
    return unusedValidators[0];
  };

  const createERC20RecurringPayment = async (
    recipientAddr: Address,
    executionTimes: Array<number>,
    amount: bigint,
    times: number
  ) => {
    try {
      if (actaAccount === undefined) {
        return;
      }
      const paymasterAddress = PAYMASTER_ADDRESS as Address;
      const validator = await getValidatorForNonce();
      console.log(`validator: ${validator}`);
      const actaFees = await calculateActaFees(amount, validator);
      const paymasterFees = await getPaymasterfees(validator);
      const { actaFeesRecipient, paymasterFeesRecipient } =
        await getActaFeesRecipients(validator);
      const userOps: Array<UserOperation<"0.7">> = [];
      const { factory, factoryData } = await actaAccount.getFactoryArgs();
      const nonce = await actaAccount.getValidatorNonce(validator);
      if (swAddress && actaFees !== undefined && nonce) {
        const transferData = await createTransferCallData(
          eoaAddress as Address,
          recipientAddr,
          details.subscription.tokens[0].address,
          amount,
          actaFees,
          paymasterFees,
          actaFeesRecipient,
          paymasterFeesRecipient
        );
        for (let i = 0; i < times; i++) {
          const preOp: UserOperation<"0.7"> = {
            ...getDefaultUserOp(),
            sender: swAddress as Address,
            nonce: nonce + BigInt(i),
            factory: i === 0 && factoryData ? factory : undefined,
            factoryData: i === 0 && factoryData ? factoryData : undefined,
            callData: transferData,
            paymaster: paymasterAddress,
            paymasterData: encodePacked(
              ["address", "uint128", "uint128"],
              [paymasterAddress, 100000n, 500000n]
            ),
          };
          const sponsoredUserOp = await toSignedPaymasterData(
            `${PAYMASTER_URL}/api/sign/v2`,
            preOp
          );
          const userOp: UserOperation<"0.7"> = {
            ...sponsoredUserOp,
            paymaster: PAYMASTER_ADDRESS as Address,
          };
          userOps.push(userOp);
        }
      }
      // Merkle signature stuff
      await createERC20Transfer({
        userOps: userOps,
        executionTimes: executionTimes,
        paymasterUrl: PAYMASTER_URL,
        paymentType: "subscription",
        paymentTypeParams: {
          subscriberId: uuidv4(),
          owner: eoaAddress as Address,
          planId: plan.planId,
          subscriptionId: details.subscription.id,
          paylinkUrl: "",
          sessionId: sessionId as string,
        },
      });
    } catch (error) {
      console.error("Error in createERC20RecurringPayment: ", error);
    }
  };

  const createTransaction = async () => {
    if (plan === null) return;
    const execTimes = generateExecutionTimes(
      Date.now() + 3 * 60 * 1000,
      plan.frequency,
      plan.volume
    );
    const usdcAmount = parseUnits(
      plan.amount,
      details.subscription.tokens[0].decimals
    );
    await createERC20RecurringPayment(
      details.subscription.receivers[0].address,
      execTimes,
      usdcAmount,
      plan.volume
    );
  };

  const approve = async () => {
    if (plan === null) return;
    const validator = await getValidatorForNonce();
    const usdcAmount = parseUnits(
      plan.amount,
      details.subscription.tokens[0].decimals
    );
    const actaFees = await calculateActaFees(usdcAmount, validator);
    const paymasterFees = await getPaymasterfees(validator);
    const totalAllowanceRequired =
      (usdcAmount + actaFees + paymasterFees) * BigInt(plan.volume);
    const callData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [swAddress as Address, totalAllowanceRequired],
    });
    const result = await sendTransactionAsync({
      to: details.subscription.tokens[0].address,
      data: callData,
      value: 0n,
    });
    setIsApprovalRequired(false);
  };

  const handlePlanChange = (id: string) => {
    const plan = details.subscription.plans.find((plan: any) => plan.id === id);
    console.log(plan.frequency);
    if (plan) {
      setPlan({
        planId: plan.id,
        amount: plan.price.toString(),
        frequency: plan.frequency,
        volume: plan.volume,
      });
    }
  };

  const handleSubscribe = async () => {
    if (isApprovalRequired) {
      await approve();
    }
    await createTransaction();
    setSubscriptionStatus(true);
  };

  if (!details)
    return (
      <div className="flex items-center justify-center h-screen text-lg font-semibold">
        Loading...
      </div>
    );

  if (subscriptionStatus) {
    return (
      <>
        <div className="flex justify-end items-center w-full my-5 px-5">
          {eoaStatus === "disconnected" && (
            <button
              className="w-auto p-2 bg-black text-white font-bold rounded-lg"
              onClick={(e) => connect({ connector: injected() })}
            >
              Connect Wallet
            </button>
          )}
          {eoaStatus === "connected" && (
            <div className="w-auto flex justify-between items-center gap-2">
              <span className="p-2 bg-gray-100 rounded-lg">{eoaAddress}</span>
              <button
                className="bg-black text-white p-2 rounded-full"
                onClick={(e) => disconnect()}
              >
                <IoPower />
              </button>
            </div>
          )}
        </div>
        <div className="max-w-2xl mx-auto p-6 bg-white shadow-lg rounded-lg flex justify-center items-center">
          <p>You have already subscribed.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex justify-end items-center w-full my-5 px-5">
        {eoaStatus === "disconnected" && (
          <button
            className="w-auto p-2 bg-black text-white font-bold rounded-lg"
            onClick={(e) => connect({ connector: injected() })}
          >
            Connect Wallet
          </button>
        )}
        {eoaStatus === "connected" && (
          <div className="w-auto flex justify-between items-center gap-2">
            <span className="p-2 bg-gray-100 rounded-lg">{eoaAddress}</span>
            <button
              className="bg-black text-white p-2 rounded-full"
              onClick={(e) => disconnect()}
            >
              <IoPower />
            </button>
          </div>
        )}
      </div>
      <div className="max-w-2xl mx-auto p-6 bg-white shadow-lg rounded-lg">
        <h1 className="text-2xl font-bold text-center mb-4">
          {details.subscription.title}
        </h1>
        <div className="border-t border-gray-300 pt-4">
          <h2 className="text-lg font-semibold">Plans:</h2>
          <select
            name="networks"
            id="networks"
            className="my-2 w-full p-3 bg-gray-100 rounded-lg"
            onChange={(e) => {
              handlePlanChange(e.target.value);
            }}
          >
            <option value={""}>Select Plan</option>
            {details.subscription.plans.map((plan: any, index: number) => {
              return (
                <option value={plan.id} key={index}>
                  {plan.name} | {plan.frequency} x {plan.volume} | {plan.price}{" "}
                  {details.subscription.tokens[0].symbol}
                </option>
              );
            })}
          </select>
        </div>
        <div className="mt-4 border-t border-gray-300 pt-4">
          <p className="text-lg">
            <span className="font-semibold">Receiver Address:</span>{" "}
            {details.subscription.receivers[0].address}
          </p>
        </div>
        <button
          className="w-full mt-2 py-2 bg-black text-white font-bold rounded-lg"
          onClick={(e) => {
            handleSubscribe();
          }}
        >
          {isApprovalRequired ? "Approve" : "Sign"}
        </button>
      </div>
    </>
  );
}
