"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WhatsappConnectionRow } from "@/types/database";

export function EmbeddedSignupButton({
  onConnecting,
  onConnected,
  onError,
}: {
  onConnecting?: () => void;
  onConnected?: (connection: WhatsappConnectionRow) => void;
  onError?: (message: string) => void;
}) {
  const [sdkReady, setSdkReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const sessionInfoRef = useRef<{ waba_id?: string; phone_number_id?: string }>({});

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;

  useEffect(() => {
    if (!appId) return;

    function handleMessage(event: MessageEvent) {
      if (typeof event.origin !== "string") return;
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          event?: string;
          data?: { waba_id?: string; phone_number_id?: string };
        };
        if (data.type === "WA_EMBEDDED_SIGNUP" && data.data) {
          sessionInfoRef.current = {
            waba_id: data.data.waba_id,
            phone_number_id: data.data.phone_number_id,
          };
        }
      } catch {
        // mensagens não-JSON do SDK — ignorar
      }
    }
    window.addEventListener("message", handleMessage);

    if (window.FB) {
      setSdkReady(true);
    } else {
      window.fbAsyncInit = () => {
        window.FB?.init({
          appId,
          autoLogAppEvents: true,
          xfbml: false,
          version: process.env.NEXT_PUBLIC_META_GRAPH_VERSION || "v21.0",
        });
        setSdkReady(true);
      };
      if (!document.getElementById("facebook-jssdk")) {
        const script = document.createElement("script");
        script.id = "facebook-jssdk";
        script.src = "https://connect.facebook.net/pt_BR/sdk.js";
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
      }
    }

    return () => window.removeEventListener("message", handleMessage);
  }, [appId]);

  const launchSignup = useCallback(() => {
    if (!window.FB || !configId) {
      toast.error(
        "Embedded Signup indisponível: verifique NEXT_PUBLIC_META_APP_ID e NEXT_PUBLIC_META_CONFIG_ID."
      );
      return;
    }
    setConnecting(true);

    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          // Usuário fechou o popup sem concluir — volta para Estado 1 silenciosamente
          setConnecting(false);
          return;
        }
        const { waba_id, phone_number_id } = sessionInfoRef.current;
        onConnecting?.();

        void (async () => {
          try {
            const res = await fetch("/api/whatsapp/embedded-signup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code, waba_id, phone_number_id }),
            });
            const json = (await res.json()) as {
              error?: string;
              connection?: WhatsappConnectionRow;
            };
            if (!res.ok) {
              onError?.(json.error ?? "Não foi possível registrar a conexão.");
              return;
            }
            if (json.connection) onConnected?.(json.connection);
          } catch {
            onError?.("Erro de conexão ao registrar o número. Tente novamente.");
          } finally {
            setConnecting(false);
          }
        })();
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, sessionInfoVersion: "3" },
      }
    );
  }, [configId, onConnecting, onConnected, onError]);

  return (
    <Button
      onClick={launchSignup}
      disabled={!sdkReady}
      loading={connecting}
      className="w-full sm:w-auto"
    >
      <Smartphone className="h-4 w-4" aria-hidden />
      Conectar WhatsApp com a Meta
    </Button>
  );
}
