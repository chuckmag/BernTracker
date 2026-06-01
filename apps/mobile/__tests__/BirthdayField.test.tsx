import React from 'react'
import { Platform } from 'react-native'
import { act, render, fireEvent } from '@testing-library/react-native'
import BirthdayField from '../src/components/BirthdayField'

// Stub the native DateTimePicker as a no-op `View` that pulls `onChange`
// + `value` off props via lastProps so the test can drive a pick directly.
let lastPickerProps: { onChange: (e: { type: string }, d?: Date) => void; value: Date } | null = null
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native')
  return {
    __esModule: true,
    default: (props: { onChange: (e: { type: string }, d?: Date) => void; value: Date; testID?: string }) => {
      lastPickerProps = { onChange: props.onChange, value: props.value }
      return <View testID={props.testID} />
    },
  }
})

beforeEach(() => {
  jest.clearAllMocks()
  lastPickerProps = null
  Platform.OS = 'android'
})

describe('BirthdayField', () => {
  test('renders placeholder when value is empty', () => {
    const { getByText, getByTestId } = render(<BirthdayField value="" onChange={() => {}} />)
    expect(getByText('Tap to pick a date')).toBeTruthy()
    expect(getByTestId('birthday-field')).toBeTruthy()
  })

  test('renders formatted long-date when value is set', () => {
    // Intl long-date format includes the year and month name; assert on a
    // stable substring rather than the full localized string.
    const { getByText } = render(<BirthdayField value="1990-04-15" onChange={() => {}} />)
    expect(getByText(/1990/)).toBeTruthy()
    expect(getByText(/April/)).toBeTruthy()
  })

  test('Android: picking a date fires onChange with YYYY-MM-DD', () => {
    const onChange = jest.fn()
    const { getByTestId } = render(<BirthdayField value="" onChange={onChange} />)
    fireEvent.press(getByTestId('birthday-field'))

    expect(lastPickerProps).not.toBeNull()
    lastPickerProps!.onChange({ type: 'set' }, new Date(1990, 3, 15)) // April = month 3
    expect(onChange).toHaveBeenCalledWith('1990-04-15')
  })

  test('Android: dismissing the picker (event.type !== "set") leaves value untouched', () => {
    const onChange = jest.fn()
    const { getByTestId } = render(<BirthdayField value="1990-04-15" onChange={onChange} />)
    fireEvent.press(getByTestId('birthday-field'))

    lastPickerProps!.onChange({ type: 'dismissed' }, undefined)
    expect(onChange).not.toHaveBeenCalled()
  })

  test('iOS: wheel scrolls do not commit to the parent until Done is pressed', () => {
    Platform.OS = 'ios'
    const onChange = jest.fn()
    const { getByTestId } = render(<BirthdayField value="" onChange={onChange} />)
    fireEvent.press(getByTestId('birthday-field'))

    expect(lastPickerProps).not.toBeNull()
    // Picker's onChange isn't fired through fireEvent, so wrap in act() to
    // flush the iosDraft setState before the Done press reads it.
    act(() => { lastPickerProps!.onChange({ type: 'set' }, new Date(1980, 5, 10)) })
    act(() => { lastPickerProps!.onChange({ type: 'set' }, new Date(2000, 0, 1)) })
    // Draft state holds the picks; parent state is untouched until Done.
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.press(getByTestId('birthday-field-done'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('2000-01-01')
  })

  test('iOS: Cancel after scrolling leaves the parent value unchanged', () => {
    Platform.OS = 'ios'
    const onChange = jest.fn()
    const { getByTestId } = render(<BirthdayField value="1990-04-15" onChange={onChange} />)
    fireEvent.press(getByTestId('birthday-field'))

    // User spins the wheel to a wrong date, then taps Cancel.
    act(() => { lastPickerProps!.onChange({ type: 'set' }, new Date(1975, 7, 20)) })
    fireEvent.press(getByTestId('birthday-field-cancel'))

    expect(onChange).not.toHaveBeenCalled()
  })

  test('iOS: Done with no scrolls leaves an already-set value untouched', () => {
    Platform.OS = 'ios'
    const onChange = jest.fn()
    const { getByTestId } = render(<BirthdayField value="1990-04-15" onChange={onChange} />)
    fireEvent.press(getByTestId('birthday-field'))
    fireEvent.press(getByTestId('birthday-field-done'))
    expect(onChange).not.toHaveBeenCalled()
  })

  test('iOS: Done with no scrolls from empty commits the displayed default', () => {
    // The spinner opens showing 2000-01-01 when the field is empty. If the
    // user taps Done without scrolling, they reasonably expect the visible
    // date to land in the field — otherwise the onboarding validator rejects
    // them on the next tap.
    Platform.OS = 'ios'
    const onChange = jest.fn()
    const { getByTestId } = render(<BirthdayField value="" onChange={onChange} />)
    fireEvent.press(getByTestId('birthday-field'))
    fireEvent.press(getByTestId('birthday-field-done'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('2000-01-01')
  })

  test('a11y: stable label + dynamic accessibilityValue', () => {
    // Screen readers announce label and value separately; the value should
    // reflect the current display string without rewriting the label each
    // render.
    const empty = render(<BirthdayField value="" onChange={() => {}} />)
    const emptyTrigger = empty.getByTestId('birthday-field')
    expect(emptyTrigger.props.accessibilityLabel).toBe('Birthday, tap to pick a date')
    expect(emptyTrigger.props.accessibilityValue).toEqual({ text: 'not set' })

    const filled = render(<BirthdayField value="1990-04-15" onChange={() => {}} />)
    const filledTrigger = filled.getByTestId('birthday-field')
    expect(filledTrigger.props.accessibilityLabel).toBe('Birthday, tap to pick a date')
    expect(filledTrigger.props.accessibilityValue?.text).toMatch(/1990/)
  })
})
