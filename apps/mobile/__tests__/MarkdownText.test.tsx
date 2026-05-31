import React from 'react'
import { Linking } from 'react-native'
import { render, fireEvent } from '@testing-library/react-native'
import MarkdownText from '../src/components/MarkdownText'

describe('MarkdownText', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders nothing for null source', () => {
    const { toJSON } = render(<MarkdownText source={null} />)
    expect(toJSON()).toBeNull()
  })

  test('renders nothing for whitespace-only source', () => {
    const { toJSON } = render(<MarkdownText source={'   \n  '} />)
    expect(toJSON()).toBeNull()
  })

  test('renders plain text content', () => {
    const { getByText } = render(<MarkdownText source="Hello world" />)
    expect(getByText('Hello world')).toBeTruthy()
  })

  test('renders bold and italic inline marks', () => {
    const { getByText } = render(<MarkdownText source="**bold** and *italic*" />)
    expect(getByText('bold')).toBeTruthy()
    expect(getByText('italic')).toBeTruthy()
  })

  test('renders unordered list items', () => {
    const source = '- Thrusters\n- Pull-ups\n- Box jumps'
    const { getByText } = render(<MarkdownText source={source} />)
    expect(getByText('Thrusters')).toBeTruthy()
    expect(getByText('Pull-ups')).toBeTruthy()
    expect(getByText('Box jumps')).toBeTruthy()
  })

  test('renders ordered list items', () => {
    const source = '1. First\n2. Second\n3. Third'
    const { getByText } = render(<MarkdownText source={source} />)
    expect(getByText('First')).toBeTruthy()
    expect(getByText('Second')).toBeTruthy()
    expect(getByText('Third')).toBeTruthy()
  })

  test('renders headings', () => {
    const source = '# Title\n## Subtitle'
    const { getByText } = render(<MarkdownText source={source} />)
    expect(getByText('Title')).toBeTruthy()
    expect(getByText('Subtitle')).toBeTruthy()
  })

  test('renders inline code', () => {
    const { getByText } = render(<MarkdownText source="Use `npm install` first" />)
    expect(getByText('npm install')).toBeTruthy()
  })

  test('renders link text and opens URL on press', () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    const { getByText } = render(<MarkdownText source="[CrossFit](https://crossfit.com)" />)
    const link = getByText('CrossFit')
    fireEvent.press(link)
    expect(openSpy).toHaveBeenCalledWith('https://crossfit.com')
    openSpy.mockRestore()
  })

  test('exposes testID on the wrapping container when provided', () => {
    const { getByTestId } = render(
      <MarkdownText source="hello" testID="coach-notes-body" />,
    )
    expect(getByTestId('coach-notes-body')).toBeTruthy()
  })

  test('does not wrap in an extra View when no testID is provided', () => {
    // Sanity check that the default render path doesn't add an extra wrapper —
    // keeps layout predictable for callers that put MarkdownText inside their
    // own positioning View.
    const { queryByTestId } = render(<MarkdownText source="hello" />)
    expect(queryByTestId('coach-notes-body')).toBeNull()
  })
})
