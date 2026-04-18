/**
 * QuantLabWrapper.tsx — Wrapper pour toutes les vues Quant Lab V3
 *
 * Fournit:
 * - Header global avec sélecteur "Run actuel" / "Portfolio 5K"
 * - SelectionProvider pour le contexte partagé
 * - Layout cohérent
 */

import React from "react";
import { SelectionProvider } from "../../lib/SelectionContext";
import { QuantLabHeader } from "./QuantLabHeader";

interface QuantLabWrapperProps {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    onRefresh?: () => void;
    loading?: boolean;
}

export function QuantLabWrapper({
    title,
    subtitle,
    children,
    onRefresh,
    loading,
}: QuantLabWrapperProps) {
    return (
        <div className="flex flex-col h-full">
            <QuantLabHeader
                title={title}
                subtitle={subtitle}
                onRefresh={onRefresh}
                loading={loading}
            />
            <div className="flex-1 overflow-auto">
                {children}
            </div>
        </div>
    );
}

/**
 * QuantLabWithProvider — Wrapper avec SelectionProvider intégré
 * Utiliser ce composant au niveau de l'app pour wraper tout le Quant Lab
 */
export function QuantLabWithProvider({ children }: { children: React.ReactNode }) {
    return (
        <SelectionProvider>
            {children}
        </SelectionProvider>
    );
}

export default QuantLabWrapper;
