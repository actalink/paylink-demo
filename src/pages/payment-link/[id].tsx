import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { usePathname } from "next/navigation";
import { ACTA_API_KEY, ACTA_BASE_URL } from "../../utils";

export default function PaymentLink() {
  const path = usePathname();
  const router = useRouter();

    async function createCheckoutSession(paymentId: string): Promise<any> {
    const res = await fetch(`${ACTA_BASE_URL}/createcheckoutsession`, {
      method: "POST",
      body: JSON.stringify({
        paymentId: paymentId,
      }),
      headers: {
        "Content-Type": "application/json",
         "x-api-key":
            ACTA_API_KEY,
      },
    });
    const jsonRes = await res.json();
    const sessionId = jsonRes.sessionId;
    return sessionId;
  }

  useEffect(() => {
    const createCheckout = async () => {
      if (path !== null) {
        const paymentId = path.split("/");
        const sessionId = await createCheckoutSession(paymentId[2])
        router.push(`/checkout-session/${sessionId}`);
      }
    };
    createCheckout();
  }, [path]);

  return <div className="flex items-center justify-center h-screen text-lg font-semibold">Loading...</div>;
}