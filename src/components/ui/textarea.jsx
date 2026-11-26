import * as React from "react";
import { cn } from "@/lib/utils";
const Textarea = React.forwardRef(({ className, ...props }, ref) => {
    return (<textarea className={cn("flex min-h-[60px] w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", className)} ref={ref} {...props}/>);
});
Textarea.displayName = "Textarea";
export { Textarea };
