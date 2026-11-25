'use client';

import { useCallback, useEffect } from 'react';
import { TextAlign } from '@tiptap/extension-text-align';
import {
  BackgroundColor,
  Color,
  FontFamily,
  FontSize,
  TextStyle,
} from '@tiptap/extension-text-style';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Code,
  Highlighter,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/* ─────────────────────────────────────────────────────────────
   Toolbar option sets
   ───────────────────────────────────────────────────────────── */

const BLOCK_OPTIONS = [
  { label: 'Title', hint: 'H1', level: 1 as const, className: 'text-xl font-bold' },
  { label: 'Heading', hint: 'H2', level: 2 as const, className: 'text-lg font-bold' },
  { label: 'Subheading', hint: 'H3', level: 3 as const, className: 'text-base font-semibold' },
  { label: 'Small heading', hint: 'H4', level: 4 as const, className: 'text-sm font-semibold' },
];

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '30px', '36px'];

const FONT_FAMILIES = [
  { label: 'Default', value: null },
  { label: 'Sans serif', value: 'Inter, Arial, Helvetica, sans-serif' },
  { label: 'Serif', value: 'Georgia, Cambria, "Times New Roman", serif' },
  { label: 'Monospace', value: '"Geist Mono", ui-monospace, SFMono-Regular, monospace' },
];

const TEXT_COLORS = [
  '#0f172a',
  '#475569',
  '#94a3b8',
  '#0d9488',
  '#0ea5e9',
  '#4318ff',
  '#7c3aed',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
];

const HIGHLIGHT_COLORS = [
  '#fef08a',
  '#bbf7d0',
  '#bfdbfe',
  '#e9d5ff',
  '#fecaca',
  '#fed7aa',
  '#ccfbf1',
  '#e2e8f0',
];

const ALIGNMENTS = [
  { value: 'left', label: 'Align left', icon: AlignLeft },
  { value: 'center', label: 'Align center', icon: AlignCenter },
  { value: 'right', label: 'Align right', icon: AlignRight },
  { value: 'justify', label: 'Justify', icon: AlignJustify },
] as const;

/* ─────────────────────────────────────────────────────────────
   Toolbar primitives
   ───────────────────────────────────────────────────────────── */

type ToolbarButtonProps = {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
};

function ToolbarButton({ onClick, isActive, disabled, label, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      // onMouseDown prevents the editor losing its selection before the command runs.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      className={cn(
        'flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-1.5 text-sm transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        isActive
          ? 'bg-teal-600 text-white hover:bg-teal-600'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-gray-200" />;
}

type ToolbarMenuProps = {
  label: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
  widthClass?: string;
};

function ToolbarMenu({ label, trigger, children, widthClass }: ToolbarMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          title={label}
          aria-label={label}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 data-[state=open]:bg-gray-100"
        >
          {trigger}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={cn('bg-white', widthClass)}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SwatchGrid({
  colors,
  activeColor,
  onPick,
}: {
  colors: string[];
  activeColor?: string;
  onPick: (color: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-1 p-1">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(color)}
          title={color}
          aria-label={color}
          className={cn(
            'h-6 w-6 rounded-md border transition-transform hover:scale-110',
            activeColor?.toLowerCase() === color.toLowerCase()
              ? 'border-teal-600 ring-2 ring-teal-500/40'
              : 'border-gray-200',
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Toolbar
   ───────────────────────────────────────────────────────────── */

function Toolbar({ editor }: { editor: Editor }) {
  // TipTap v3 does not re-render on every transaction, so the active states
  // the toolbar paints come from an explicit state selector.
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      isBold: instance.isActive('bold'),
      isItalic: instance.isActive('italic'),
      isUnderline: instance.isActive('underline'),
      isStrike: instance.isActive('strike'),
      isCode: instance.isActive('code'),
      isBulletList: instance.isActive('bulletList'),
      isOrderedList: instance.isActive('orderedList'),
      isBlockquote: instance.isActive('blockquote'),
      isLink: instance.isActive('link'),
      headingLevel: BLOCK_OPTIONS.find((option) =>
        instance.isActive('heading', { level: option.level }),
      )?.level,
      alignment:
        ALIGNMENTS.find((option) => instance.isActive({ textAlign: option.value }))?.value ??
        'left',
      fontSize: instance.getAttributes('textStyle').fontSize as string | undefined,
      fontFamily: instance.getAttributes('textStyle').fontFamily as string | undefined,
      color: instance.getAttributes('textStyle').color as string | undefined,
      backgroundColor: instance.getAttributes('textStyle').backgroundColor as string | undefined,
      canUndo: instance.can().undo(),
      canRedo: instance.can().redo(),
    }),
  });

  const handleSetLink = useCallback(() => {
    const previous = (editor.getAttributes('link').href as string | undefined) ?? '';
    const input = window.prompt('Link URL', previous);

    // Cancelled dialog: leave the document untouched.
    if (input === null) return;

    const href = input.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    // Bare domains would otherwise resolve against the admin panel's own origin.
    const normalised = /^(https?:\/\/|mailto:|tel:)/i.test(href) ? href : `https://${href}`;

    editor.chain().focus().extendMarkRange('link').setLink({ href: normalised }).run();
  }, [editor]);

  const activeBlock = BLOCK_OPTIONS.find((option) => option.level === state.headingLevel);
  const AlignmentIcon =
    ALIGNMENTS.find((option) => option.value === state.alignment)?.icon ?? AlignLeft;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-0.5 rounded-t-xl border-b border-gray-200 bg-gray-50/80 px-2 py-1.5">
      {/* Block / title formatting */}
      <ToolbarMenu
        label="Paragraph style"
        widthClass="w-52"
        trigger={
          <>
            <span className="w-24 truncate text-left">{activeBlock?.label ?? 'Body text'}</span>
            <span className="text-[10px] text-gray-400">▾</span>
          </>
        }
      >
        <DropdownMenuLabel>Paragraph style</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => editor.chain().focus().setParagraph().run()}
          className={cn('text-sm', !state.headingLevel && 'bg-teal-50 text-teal-900')}
        >
          Body text
        </DropdownMenuItem>
        {BLOCK_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.level}
            onSelect={() => editor.chain().focus().toggleHeading({ level: option.level }).run()}
            className={cn(
              'flex items-center justify-between',
              state.headingLevel === option.level && 'bg-teal-50 text-teal-900',
            )}
          >
            <span className={option.className}>{option.label}</span>
            <span className="text-xs text-gray-400">{option.hint}</span>
          </DropdownMenuItem>
        ))}
      </ToolbarMenu>

      <ToolbarDivider />

      {/* Font formatting */}
      <ToolbarMenu
        label="Font size"
        widthClass="w-32"
        trigger={
          <>
            <span className="w-10 text-left">{state.fontSize?.replace('px', '') ?? '16'}</span>
            <span className="text-[10px] text-gray-400">▾</span>
          </>
        }
      >
        <DropdownMenuLabel>Font size</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => editor.chain().focus().unsetFontSize().run()}>
          Default
        </DropdownMenuItem>
        {FONT_SIZES.map((size) => (
          <DropdownMenuItem
            key={size}
            onSelect={() => editor.chain().focus().setFontSize(size).run()}
            className={cn(state.fontSize === size && 'bg-teal-50 text-teal-900')}
          >
            {size.replace('px', '')}
          </DropdownMenuItem>
        ))}
      </ToolbarMenu>

      <ToolbarMenu
        label="Font family"
        widthClass="w-44"
        trigger={
          <>
            <span className="w-16 truncate text-left">
              {FONT_FAMILIES.find((font) => font.value === state.fontFamily)?.label ?? 'Font'}
            </span>
            <span className="text-[10px] text-gray-400">▾</span>
          </>
        }
      >
        <DropdownMenuLabel>Font family</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FONT_FAMILIES.map((font) => (
          <DropdownMenuItem
            key={font.label}
            onSelect={() =>
              font.value
                ? editor.chain().focus().setFontFamily(font.value).run()
                : editor.chain().focus().unsetFontFamily().run()
            }
            style={font.value ? { fontFamily: font.value } : undefined}
            className={cn(state.fontFamily === font.value && 'bg-teal-50 text-teal-900')}
          >
            {font.label}
          </DropdownMenuItem>
        ))}
      </ToolbarMenu>

      <ToolbarMenu
        label="Text color"
        widthClass="w-auto"
        trigger={
          <span className="flex flex-col items-center">
            <Baseline className="h-4 w-4" />
            <span
              className="mt-0.5 h-1 w-4 rounded-full"
              style={{ backgroundColor: state.color ?? '#0f172a' }}
            />
          </span>
        }
      >
        <DropdownMenuLabel>Text color</DropdownMenuLabel>
        <SwatchGrid
          colors={TEXT_COLORS}
          activeColor={state.color}
          onPick={(color) => editor.chain().focus().setColor(color).run()}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => editor.chain().focus().unsetColor().run()}>
          Reset color
        </DropdownMenuItem>
      </ToolbarMenu>

      <ToolbarMenu
        label="Highlight"
        widthClass="w-auto"
        trigger={
          <span className="flex flex-col items-center">
            <Highlighter className="h-4 w-4" />
            <span
              className="mt-0.5 h-1 w-4 rounded-full border border-gray-200"
              style={{ backgroundColor: state.backgroundColor ?? 'transparent' }}
            />
          </span>
        }
      >
        <DropdownMenuLabel>Highlight</DropdownMenuLabel>
        <SwatchGrid
          colors={HIGHLIGHT_COLORS}
          activeColor={state.backgroundColor}
          onPick={(color) => editor.chain().focus().setBackgroundColor(color).run()}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => editor.chain().focus().unsetBackgroundColor().run()}>
          Remove highlight
        </DropdownMenuItem>
      </ToolbarMenu>

      <ToolbarDivider />

      {/* Text formatting */}
      <ToolbarButton
        label="Bold"
        isActive={state.isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        isActive={state.isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        isActive={state.isUnderline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        isActive={state.isStrike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Inline code"
        isActive={state.isCode}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Alignment */}
      <ToolbarMenu
        label="Alignment"
        widthClass="w-40"
        trigger={
          <>
            <AlignmentIcon className="h-4 w-4" />
            <span className="text-[10px] text-gray-400">▾</span>
          </>
        }
      >
        <DropdownMenuLabel>Alignment</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ALIGNMENTS.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => editor.chain().focus().setTextAlign(option.value).run()}
              className={cn(
                'gap-2',
                state.alignment === option.value && 'bg-teal-50 text-teal-900',
              )}
            >
              <Icon className="h-4 w-4" />
              {option.label}
            </DropdownMenuItem>
          );
        })}
      </ToolbarMenu>

      <ToolbarDivider />

      {/* Blocks */}
      <ToolbarButton
        label="Bullet list"
        isActive={state.isBulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        isActive={state.isOrderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        isActive={state.isBlockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Divider"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Links */}
      <ToolbarButton label="Insert link" isActive={state.isLink} onClick={handleSetLink}>
        <Link2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Remove link"
        disabled={!state.isLink}
        onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
      >
        <Link2Off className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* History & cleanup */}
      <ToolbarButton
        label="Undo"
        disabled={!state.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={!state.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Clear formatting"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <RemoveFormatting className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Editor
   ───────────────────────────────────────────────────────────── */

export type RichTextEditorProps = {
  /**
   * Current HTML value. A controlled prop: changing it to something the editor
   * does not already contain loads that content in, which is how switching to
   * another entry works.
   */
  value: string;
  onChange: (html: string) => void;
  className?: string;
};

export default function RichTextEditor({
  value,
  onChange,
  className,
}: Readonly<RichTextEditorProps>) {
  const editor = useEditor({
    // Next.js renders this on the server first; rendering the editor
    // immediately would produce a hydration mismatch.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, autolink: true },
      }),
      TextStyle,
      FontSize,
      FontFamily,
      Color,
      BackgroundColor,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'whats-new-content min-h-full px-5 py-4 focus:outline-none',
      },
    },
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML();
      // TipTap represents "empty" as <p></p>; hand back a true empty string so
      // required-field validation upstream stays simple.
      onChange(instance.isEmpty ? '' : html);
    },
  });

  // Pull `value` into the editor whenever the two have genuinely diverged,
  // which is how a different entry's content gets loaded.
  //
  // The guard is what keeps typing smooth: each keystroke fires `onUpdate`,
  // the parent stores that HTML and hands it straight back, so by the time
  // this runs `value` already equals the editor's own content and we return
  // without calling setContent, which would reset the cursor.
  useEffect(() => {
    if (!editor) return;

    // Match the normalisation onUpdate applies, so an empty editor
    // ('<p></p>') compares equal to an empty value ('').
    const current = editor.isEmpty ? '' : editor.getHTML();
    const incoming = value || '';

    if (incoming === current) return;

    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [value, editor]);

  return (
    // A flex column so a parent can bound the height: the toolbar stays put
    // and only the editable surface below it scrolls.
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-300 bg-white focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-400/30',
        className,
      )}
    >
      {editor ? (
        <>
          <Toolbar editor={editor} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <EditorContent editor={editor} />
          </div>
        </>
      ) : (
        <div className="min-h-[21rem] flex-1 animate-pulse bg-gray-50" />
      )}
    </div>
  );
}
