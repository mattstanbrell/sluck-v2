"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState } from "react"

export function JoinWorkspaceForm() {
  const [inviteCode, setInviteCode] = useState("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // TODO: Implement workspace joining
    console.log("Joining workspace with code:", inviteCode)
  }

  return (
    <form className="flex gap-2" onSubmit={handleSubmit}>
      <Input 
        placeholder="Enter invite code"
        className="bg-custom-ui-faint border-custom-ui-medium"
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value)}
      />
      <Button 
        type="submit"
        className="bg-custom-accent text-white hover:bg-custom-accent/90 whitespace-nowrap"
      >
        Join Workspace
      </Button>
    </form>
  )
} 