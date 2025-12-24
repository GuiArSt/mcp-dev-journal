"use client"

import * as React from "react"

const Collapsible = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }
>(({ open, onOpenChange, children, ...props }, ref) => {
  const [isOpen, setIsOpen] = React.useState(open ?? false)

  React.useEffect(() => {
    if (open !== undefined) {
      setIsOpen(open)
    }
  }, [open])

  const handleToggle = React.useCallback(() => {
    const newValue = !isOpen
    setIsOpen(newValue)
    onOpenChange?.(newValue)
  }, [isOpen, onOpenChange])

  return (
    <CollapsibleContext.Provider value={{ isOpen, handleToggle }}>
      <div ref={ref} {...props}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  )
})
Collapsible.displayName = "Collapsible"

interface CollapsibleContextValue {
  isOpen: boolean
  handleToggle: () => void
}

const CollapsibleContext = React.createContext<CollapsibleContextValue>({
  isOpen: false,
  handleToggle: () => {},
})

const useCollapsibleContext = () => {
  const context = React.useContext(CollapsibleContext)
  if (!context) {
    throw new Error("Collapsible components must be used within a Collapsible")
  }
  return context
}

const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ asChild, children, onClick, ...props }, ref) => {
  const { handleToggle } = useCollapsibleContext()

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    handleToggle()
    onClick?.(e)
  }

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: (e: React.MouseEvent) => {
        handleToggle()
        ;(children.props as any).onClick?.(e)
      },
    })
  }

  return (
    <button ref={ref} onClick={handleClick} {...props}>
      {children}
    </button>
  )
})
CollapsibleTrigger.displayName = "CollapsibleTrigger"

const CollapsibleContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, style, ...props }, ref) => {
  const { isOpen } = useCollapsibleContext()

  if (!isOpen) {
    return null
  }

  return (
    <div ref={ref} {...props}>
      {children}
    </div>
  )
})
CollapsibleContent.displayName = "CollapsibleContent"

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
