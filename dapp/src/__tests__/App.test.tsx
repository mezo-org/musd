import { render, screen } from "@testing-library/react"

import App from "../App"

test("Renders main page", () => {
  render(<App />)
  expect(true).toBeTruthy()
})

test("Renders App text", async () => {
  render(<App />)
  const text = await screen.findByText(/App/i)
  expect(text).toBeInTheDocument()
})
