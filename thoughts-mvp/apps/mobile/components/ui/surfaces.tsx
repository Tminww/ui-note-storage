/** Project-owned gluestack-style semantic primitives for shared Expo UI. */
import React from 'react'
import { View, Text as RNText, type ViewProps, type TextProps } from 'react-native'
import { tva } from '@gluestack-ui/utils/nativewind-utils'

const headingStyle = tva({ base: 'text-xl font-bold text-foreground' })
const textStyle = tva({ base: 'text-foreground' })

export function Box({ className = '', ...props }: ViewProps & { className?: string }) {
    return <View className={className} {...props} />
}
export function Card({ className = '', ...props }: ViewProps & { className?: string }) {
    return (
        <Box className={`rounded-2xl border border-border bg-card p-4 ${className}`} {...props} />
    )
}
export function VStack({ className = '', ...props }: ViewProps & { className?: string }) {
    return <Box className={`flex-col gap-3 ${className}`} {...props} />
}
export function HStack({ className = '', ...props }: ViewProps & { className?: string }) {
    return <Box className={`flex-row items-center gap-3 ${className}`} {...props} />
}
export function Text({ className = '', ...props }: TextProps & { className?: string }) {
    return <RNText className={textStyle({ class: className })} {...props} />
}
export function Heading({ className = '', ...props }: TextProps & { className?: string }) {
    return (
        <RNText
            accessibilityRole="header"
            className={headingStyle({ class: className })}
            {...props}
        />
    )
}
