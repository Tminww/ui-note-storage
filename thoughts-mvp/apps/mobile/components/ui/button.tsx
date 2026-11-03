/**
 * gluestack-ui v5 copy-paste style component: the press/focus/disabled behavior
 * comes from @gluestack-ui/core, while UniWind applies semantic Tailwind v4 tokens.
 * Based on gluestack's v5 button creator pattern (MIT license).
 */
import React from 'react'
import { ActivityIndicator, Pressable, Text, View, type PressableProps } from 'react-native'
import { createButton } from '@gluestack-ui/core/button/creator'

const CoreButton = createButton({
    Root: Pressable,
    Text,
    Group: View,
    Spinner: ActivityIndicator,
    Icon: View
})

type Variant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive'
type Size = 'default' | 'sm' | 'lg' | 'icon'

const variants: Record<Variant, string> = {
    default: 'bg-primary',
    outline: 'bg-card border border-border',
    secondary: 'bg-secondary',
    ghost: 'bg-transparent',
    destructive: 'bg-destructive/10'
}
const sizes: Record<Size, string> = {
    default: 'min-h-10 px-4 py-2',
    sm: 'min-h-9 px-3 py-2',
    lg: 'min-h-12 px-5 py-3',
    icon: 'h-10 w-10'
}
export type ButtonProps = PressableProps & {
    variant?: Variant
    size?: Size
    className?: string
}
export function Button({
    variant = 'default',
    size = 'default',
    className = '',
    ...props
}: ButtonProps) {
    return (
        <CoreButton
            accessibilityRole="button"
            className={`flex-row items-center justify-center gap-2 rounded-xl ${variants[variant]} ${sizes[size]} ${className}`}
            {...props}
        />
    )
}
export function ButtonText({
    children,
    variant = 'default',
    size = 'default'
}: {
    children: React.ReactNode
    variant?: Variant
    size?: Size
}) {
    const tone =
        variant === 'default'
            ? 'text-primary-foreground'
            : variant === 'destructive'
              ? 'text-destructive'
              : variant === 'secondary'
                ? 'text-secondary-foreground'
                : 'text-foreground'
    return (
        <CoreButton.Text
            className={`font-semibold ${size === 'sm' ? 'text-xs' : 'text-sm'} ${tone}`}
        >
            {children}
        </CoreButton.Text>
    )
}
export function ButtonSpinner({ variant = 'default' }: { variant?: Variant }) {
    return <CoreButton.Spinner color={variant === 'default' ? '#FFFFFF' : '#6259E8'} />
}
