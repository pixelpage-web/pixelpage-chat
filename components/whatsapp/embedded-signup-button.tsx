"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botão do Embedded Signup da Meta (Tech Provider).
 * Fluxo: SDK do Facebook → FB.login com config_id → o popup da Meta devolve
 * um `code` e dispara um postMessage WA_EMBEDDED_SIGNUP com waba_id e
 * phone_number_id → enviamos tudo ao servidor para registrar a conexão.
 */
export function EmbeddedSignupButton({
  onConnected,
}: {
  onConnected?: () => void;
}) {
  const [sdkReady, setSdkReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // Dados da sessão do Embedded Signup chegam via postMessage do facebook.com
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
        // mensagens que não são JSON são de outros recursos do SDK — ignorar
      }
    }
    window.addEventListener("message", handleMessage);

    // Carrega o SDK do Facebook uma única vez
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
          setConnecting(false);
          toast.error("Conexão cancelada antes de concluir a autorização.");
          return;
        }
        const { waba_id, phone_number_id } = sessionInfoRef.current;

        void (async () => {
          try {
            const res = await fetch("/api/whatsapp/embedded-signup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code, waba_id, phone_number_id }),
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) {
              toast.error(json.error ?? "Não foi possível registrar a conexão.");
              return;
            }
            toast.success("WhatsApp conectado com sucesso!");
            onConnected?.();
          } catch {
            toast.error("Erro de conexão ao registrar o número. Tente novamente.");
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
  }, [configId, onConnected]);

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
