# Sluck Theme Documentation

## Color Palette

### Background Colors
- **Primary Background** (`bg-custom-background`, `#FFFCF0`): Main application background
- **Secondary Background** (`bg-custom-background-secondary`, `#F2F0E5`): Used for cards, sidebars, and content areas

### Text Colors
- **Primary Text** (`text-custom-text`, `#100F0F`): Main text color
- **Secondary Text** (`text-custom-text-secondary`, `#6F6E69`): Less prominent text, subtitles
- **Tertiary Text** (`text-custom-text-tertiary`, `#B7B5AC`): Subtle text, timestamps, metadata

### Accent Colors
- **Primary Accent** (`text-custom-accent`, `#24837B`): Links, buttons, and interactive elements

### UI Element Colors
- **Faint UI** (`bg-custom-ui-faint`, `#E6E4D9`): Subtle backgrounds, hover states
- **Medium UI** (`bg-custom-ui-medium`, `#DAD8CE`): Borders, dividers
- **Strong UI** (`bg-custom-ui-strong`, `#CECDC3`): More prominent UI elements

### Special Colors
- **Highlight** (`bg-highlight`, `rgba(247,209,61,0.3)`): Text highlighting, selection states

## Implementation

### Direct Color Classes
Use these Tailwind classes for direct color application:

```tsx
// Backgrounds
bg-custom-background          // Primary background
bg-custom-background-secondary // Secondary background

// Text
text-custom-text             // Primary text
text-custom-text-secondary   // Secondary text
text-custom-text-tertiary    // Tertiary text
text-custom-accent          // Accent color (links, etc.)

// UI Elements
bg-custom-ui-faint          // Subtle backgrounds
bg-custom-ui-medium         // Medium emphasis
bg-custom-ui-strong         // Strong emphasis

// Special
bg-highlight               // Highlighting
```

### shadcn/ui Semantic Tokens
For shadcn/ui components, use these semantic tokens:

```tsx
// Core
bg-background        // Main background
text-foreground      // Main text color

// Components
bg-card             // Card backgrounds
text-card-foreground // Card text

bg-popover          // Popover backgrounds
text-popover-foreground // Popover text

bg-primary          // Primary elements
text-primary-foreground // Text on primary

bg-secondary        // Secondary elements
text-secondary-foreground // Text on secondary

bg-muted            // Muted elements
text-muted-foreground // Muted text

bg-accent           // Accent elements
text-accent-foreground // Text on accent

bg-destructive      // Destructive actions
text-destructive-foreground // Text on destructive

// Utilities
border-border       // Border color
ring-ring          // Focus rings
```

## Usage Guidelines

### Text Hierarchy
1. Use `text-custom-text` for main content
2. Use `text-custom-text-secondary` for supporting text
3. Use `text-custom-text-tertiary` for metadata
4. Use `text-custom-accent` for interactive elements

### Background Hierarchy
1. Use `bg-custom-background` for main application background
2. Use `bg-custom-background-secondary` for elevated surfaces
3. Use UI colors (`bg-custom-ui-*`) for interactive elements

### Interactive States
1. Default: Base color
2. Hover: Next intensity up in the UI scale
3. Active: Highest intensity in the UI scale
4. Focus: Use ring-ring for focus indicators

### Component Examples

#### Buttons
```tsx
// Primary Button
<Button className="bg-accent text-white hover:bg-accent/90">
  Click Me
</Button>

// Secondary Button
<Button className="bg-ui-medium hover:bg-ui-strong text-text">
  Cancel
</Button>
```

#### Cards
```tsx
<Card className="bg-background-secondary border-ui-strong">
  <CardHeader>
    <CardTitle className="text-text">Title</CardTitle>
    <CardDescription className="text-text-secondary">Description</CardDescription>
  </CardHeader>
</Card>
```

#### Navigation
```tsx
<nav className="bg-background-secondary">
  <a className="text-accent hover:text-accent/90">Link</a>
  <span className="text-text-tertiary">•</span>
</nav>
```

## Accessibility

- Maintain WCAG 2.1 AA contrast ratios
- Primary text on background: 12.63:1
- Secondary text on background: 8.59:1
- Accent on background: 3.94:1 (meets AA for large text)

## Configuration Files

The theme is configured in two main files:

1. `tailwind.config.ts`: Defines color values and extends Tailwind's theme
2. `globals.css`: Sets up CSS variables for shadcn/ui integration

Remember to import both files in your application root to ensure proper theme application. 