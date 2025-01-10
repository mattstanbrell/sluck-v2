"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { createWorkspace } from "@/app/actions/workspace"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

export function CreateWorkspaceDialog() {
  const [workspaceName, setWorkspaceName] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!workspaceName.trim()) {
      toast({
        title: "Error",
        description: "Workspace name is required",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const workspace = await createWorkspace(workspaceName)
      toast({
        title: "Success",
        description: "Workspace created successfully",
      })
      setOpen(false)
      router.push(`/workspace/${workspace.slug}`)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create workspace",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-custom-accent text-white hover:bg-custom-accent/90">
          Create a Workspace
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-custom-text">Create a New Workspace</DialogTitle>
          <DialogDescription className="text-custom-text-secondary">
            Create a workspace to start collaborating with your team.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-custom-text">
                Workspace Name
              </Label>
              <Input
                id="name"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="bg-custom-ui-faint border-custom-ui-medium"
                placeholder="Acme Corp"
                disabled={isLoading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="submit" 
              className="bg-custom-accent text-white hover:bg-custom-accent/90"
              disabled={isLoading}
            >
              {isLoading ? "Creating..." : "Create Workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
} 