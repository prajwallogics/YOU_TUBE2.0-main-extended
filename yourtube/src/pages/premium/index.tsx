import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { Button } from "@/components/ui/button";
import { Check, Crown, Download, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

const premiumPlans = [
  {
    id: "free",
    name: "Free",
    price: 0,
    accent: "border-gray-200",
    description: "For occasional downloads",
    highlights: ["1 download per day", "Standard quality", "Ads while watching"],
  },
  {
    id: "bronze",
    name: "Bronze",
    price: 49,
    accent: "border-orange-300",
    description: "More room for casual use",
    highlights: ["5 downloads per day", "Standard quality", "Ad-free viewing"],
  },
  {
    id: "silver",
    name: "Silver",
    price: 99,
    accent: "border-gray-400",
    description: "For regular downloaders",
    highlights: ["20 downloads per day", "HD quality downloads", "Ad-free viewing"],
  },
  {
    id: "gold",
    name: "Gold",
    price: 199,
    accent: "border-amber-400",
    description: "Maximum download freedom",
    highlights: ["Unlimited downloads", "Best available quality", "Ad-free viewing"],
  },
];

const loadRazorpayScript = () =>
  new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const PremiumPage = () => {
  const { user, login, handlegooglesignin } = useUser();
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);

  const handleChoosePlan = async (plan: string) => {
    if (!user) {
      toast.error("Please sign in before choosing a plan.");
      await handlegooglesignin();
      return;
    }

    if (user.isLocalAccount) {
      toast.error("Premium checkout needs backend account sync. Please reconnect the database and sign in again.");
      return;
    }

    if (plan === "free") {
      await handleCancelPlan();
      return;
    }

    setSelectedPlan(plan);
    try {
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded || !window.Razorpay) {
        toast.error("Could not load Razorpay checkout. Check your connection.");
        return;
      }

      const orderResponse = await axiosInstance.post(`/user/premium/${user._id}/order`, {
        plan,
      });

      const { order, razorpayKeyId, user: paymentUser, plan: selectedPlanData } =
        orderResponse.data;

      if (!razorpayKeyId || !order?.id) {
        toast.error("Razorpay is not configured correctly on the server.");
        return;
      }

      const checkout = new window.Razorpay({
        key: razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        name: "YourTube",
        description: `${selectedPlanData.name} plan`,
        order_id: order.id,
        prefill: {
          name: paymentUser?.name || user.name,
          email: paymentUser?.email || user.email,
        },
        theme: {
          color: "#111827",
        },
        handler: async (payment: any) => {
          try {
            const verifyResponse = await axiosInstance.post(
              `/user/premium/${user._id}/verify`,
              {
                plan,
                razorpay_order_id: payment.razorpay_order_id,
                razorpay_payment_id: payment.razorpay_payment_id,
                razorpay_signature: payment.razorpay_signature,
              }
            );

            login(verifyResponse.data);
            toast.success(`${verifyResponse.data.premiumPlan} plan is active.`);
            if (!verifyResponse.data.invoiceEmailSent) {
              toast.warning("Your payment is active, but the invoice email could not be sent.");
            }
            router.push("/");
          } catch (error: any) {
            toast.error(
              error?.response?.data?.message ||
                "Payment completed, but verification failed."
            );
          }
        },
      });

      checkout.on("payment.failed", (response: any) => {
        toast.error(response?.error?.description || "Payment failed. Please try again.");
      });

      checkout.open();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Could not start payment.");
    } finally {
      setSelectedPlan(null);
    }
  };

  const handleCancelPlan = async () => {
    if (!user) {
      toast.error("Please sign in to manage your plan.");
      return;
    }

    setIsCancelling(true);
    try {
      const response = await axiosInstance.patch(`/user/premium/${user._id}/cancel`);
      login(response.data);
      toast.success("Your account is now on the Free plan.");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Could not change your plan.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSendInvoice = async () => {
    if (!user) return;

    setIsSendingInvoice(true);
    try {
      const response = await axiosInstance.post(`/user/premium/${user._id}/invoice`);
      if (response.data?.invoiceSent) {
        toast.success(`Invoice sent to ${user.email}.`);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Could not send the invoice email.");
    } finally {
      setIsSendingInvoice(false);
    }
  };

  const activePlan = user?.premiumPlan || "free";
  const activePlanData =
    premiumPlans.find((plan) => plan.id === activePlan) || premiumPlans[0];
  const remainingFreeDownloads = Math.max(1 - (user?.downloadCount || 0), 0);

  return (
    <main className="flex-1 px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium">
              <Crown className="h-4 w-4 text-amber-500" />
              YourTube Premium
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal">
                Choose your plan
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-600">
                Free users get 1 download per day and ads while watching. Bronze,
                Silver, and Gold include ad-free viewing and more downloads.
              </p>
            </div>
          </div>
          <div className="rounded-md border px-4 py-3 text-sm">
            <p className="font-medium">Current plan: {activePlanData.name}</p>
            <p className="text-gray-500">
              {activePlan === "gold"
                ? "Unlimited downloads active"
                : activePlan === "free"
                ? `${remainingFreeDownloads} free download left today`
                : activePlanData.highlights[0]}
            </p>
            {activePlan !== "free" && (
              <div className="mt-3 space-y-2">
                <Button
                  className="w-full"
                  variant="outline"
                  size="sm"
                  onClick={handleSendInvoice}
                  disabled={isSendingInvoice}
                >
                  <Download className="h-4 w-4" />
                  {isSendingInvoice ? "Sending invoice..." : "Send invoice to email"}
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  size="sm"
                  onClick={handleCancelPlan}
                  disabled={isCancelling}
                >
                  <XCircle className="h-4 w-4" />
                  {isCancelling ? "Cancelling..." : "Switch to Free"}
                </Button>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {premiumPlans.map((plan) => {
            const isCurrent = activePlan === plan.id;
            const isFree = plan.id === "free";

            return (
              <article
                key={plan.id}
                className={`rounded-lg border-2 ${plan.accent} bg-white p-5 shadow-sm`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{plan.name}</h2>
                    <p className="mt-1 text-sm text-gray-500">{plan.description}</p>
                  </div>
                  {isCurrent ? (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                      Active
                    </span>
                  ) : isFree ? (
                    <ShieldCheck className="h-5 w-5 text-gray-500" />
                  ) : (
                    <Sparkles className="h-5 w-5 text-gray-500" />
                  )}
                </div>

                <div className="mt-6 flex items-end gap-1">
                  <span className="text-3xl font-semibold">
                    {plan.price === 0 ? "Free" : `Rs ${plan.price}`}
                  </span>
                  {plan.price > 0 && (
                    <span className="pb-1 text-sm text-gray-500">/ month</span>
                  )}
                </div>

                <ul className="mt-6 space-y-3 text-sm">
                  {plan.highlights.map((highlight) => (
                    <li key={highlight} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="mt-6 w-full"
                  variant={isCurrent ? "secondary" : "default"}
                  disabled={isCurrent || selectedPlan === plan.id}
                  onClick={() => handleChoosePlan(plan.id)}
                >
                  <Download className="h-4 w-4" />
                  {isCurrent
                    ? "Current plan"
                    : selectedPlan === plan.id
                    ? "Opening payment..."
                    : isFree
                    ? "Switch to Free"
                    : `Pay for ${plan.name}`}
                </Button>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
};

export default PremiumPage;
