import type { JSX, ValidComponent } from 'solid-js'
import { splitProps } from 'solid-js'

import type { PolymorphicProps } from '@kobalte/core/polymorphic'
import * as SliderPrimitive from '@kobalte/core/slider'

import { cn } from '@/lib/utils'

type SliderProps<T extends ValidComponent = 'div'> = SliderPrimitive.SliderRootProps<T> & {
  class?: string | undefined
}

const Slider = <T extends ValidComponent = 'div'>(props: PolymorphicProps<T, SliderProps<T>>) => {
  const [local, others] = splitProps(props as SliderProps, ['class'])
  return (
    <SliderPrimitive.Root
      class={cn(
        'relative flex w-full touch-none flex-col items-center select-none data-[orientation=vertical]:w-auto',
        local.class,
      )}
      {...others}
    />
  )
}

type SliderTrackProps<T extends ValidComponent = 'div'> = SliderPrimitive.SliderTrackProps<T> & {
  class?: string | undefined
}

const SliderTrack = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SliderTrackProps<T>>,
) => {
  const [local, others] = splitProps(props as SliderTrackProps, ['class'])
  return (
    <SliderPrimitive.Track
      class={cn(
        "relative h-1 w-full grow cursor-pointer rounded-full bg-secondary before:pointer-events-auto before:absolute before:inset-x-0 before:-inset-y-2.5 before:bg-transparent before:content-[''] data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1 data-[orientation=vertical]:before:inset-y-0 data-[orientation=vertical]:before:-right-2.5 data-[orientation=vertical]:before:-left-6",
        local.class,
      )}
      {...others}
    />
  )
}

type SliderFillProps<T extends ValidComponent = 'div'> = SliderPrimitive.SliderFillProps<T> & {
  class?: string | undefined
}

const SliderFill = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SliderFillProps<T>>,
) => {
  const [local, others] = splitProps(props as SliderFillProps, ['class'])
  return (
    <SliderPrimitive.Fill
      class={cn(
        'absolute h-full rounded-full bg-primary data-[orientation=vertical]:h-auto data-[orientation=vertical]:w-full',
        local.class,
      )}
      {...others}
    />
  )
}

type SliderThumbProps<T extends ValidComponent = 'span'> = SliderPrimitive.SliderThumbProps<T> & {
  class?: string | undefined
  children?: JSX.Element
}

const SliderThumb = <T extends ValidComponent = 'span'>(
  props: PolymorphicProps<T, SliderThumbProps<T>>,
) => {
  const [local, others] = splitProps(props as SliderThumbProps, ['class', 'children'])
  return (
    <SliderPrimitive.Thumb
      class={cn(
        '-top-1.5 block size-4 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[orientation=vertical]:top-auto data-[orientation=vertical]:-left-1.5',
        local.class,
      )}
      {...others}
    >
      {local.children}
    </SliderPrimitive.Thumb>
  )
}

export { Slider, SliderFill, SliderThumb, SliderTrack }
export type { SliderProps, SliderFillProps, SliderThumbProps, SliderTrackProps }
