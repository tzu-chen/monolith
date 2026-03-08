export interface LatexSnippet {
  label: string;
  detail: string;
  template: string;
  preview: string;
}

export const latexSnippets: LatexSnippet[] = [
  {
    label: 'beq',
    detail: 'equation environment',
    template: '\\begin{equation}\n  #{}\n\\end{equation}',
    preview: '\\begin{equation}\n  ...\n\\end{equation}',
  },
  {
    label: 'bal',
    detail: 'align environment',
    template: '\\begin{align}\n  #{}\n\\end{align}',
    preview: '\\begin{align}\n  ...\n\\end{align}',
  },
  {
    label: 'bfig',
    detail: 'figure environment',
    template: '\\begin{figure}[#{1:htbp}]\n  \\centering\n  \\includegraphics[width=#{2:0.8}\\textwidth]{#{3:filename}}\n  \\caption{#{4:caption}}\n  \\label{fig:#{5:label}}\n\\end{figure}',
    preview: '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=...]{...}\n  \\caption{...}\n  \\label{fig:...}\n\\end{figure}',
  },
  {
    label: 'bitem',
    detail: 'itemize environment',
    template: '\\begin{itemize}\n  \\item #{}\n\\end{itemize}',
    preview: '\\begin{itemize}\n  \\item ...\n\\end{itemize}',
  },
  {
    label: 'benum',
    detail: 'enumerate environment',
    template: '\\begin{enumerate}\n  \\item #{}\n\\end{enumerate}',
    preview: '\\begin{enumerate}\n  \\item ...\n\\end{enumerate}',
  },
  {
    label: 'bframe',
    detail: 'beamer frame',
    template: '\\begin{frame}{#{1:title}}\n  #{2}\n\\end{frame}',
    preview: '\\begin{frame}{title}\n  ...\n\\end{frame}',
  },
  {
    label: 'bthm',
    detail: 'theorem environment',
    template: '\\begin{theorem}\n  #{}\n\\end{theorem}',
    preview: '\\begin{theorem}\n  ...\n\\end{theorem}',
  },
  {
    label: 'bprf',
    detail: 'proof environment',
    template: '\\begin{proof}\n  #{}\n\\end{proof}',
    preview: '\\begin{proof}\n  ...\n\\end{proof}',
  },
  {
    label: 'btab',
    detail: 'tabular environment',
    template: '\\begin{table}[#{1:htbp}]\n  \\centering\n  \\begin{tabular}{#{2:cc}}\n    \\hline\n    #{3} \\\\\\\\\n    \\hline\n  \\end{tabular}\n  \\caption{#{4:caption}}\n  \\label{tab:#{5:label}}\n\\end{table}',
    preview: '\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{cc}\n    ...\n  \\end{tabular}\n  \\caption{...}\n\\end{table}',
  },
  {
    label: 'babs',
    detail: 'abstract environment',
    template: '\\begin{abstract}\n  #{}\n\\end{abstract}',
    preview: '\\begin{abstract}\n  ...\n\\end{abstract}',
  },
  {
    label: 'sec',
    detail: 'section',
    template: '\\section{#{1:title}}\n#{}',
    preview: '\\section{title}',
  },
  {
    label: 'ssec',
    detail: 'subsection',
    template: '\\subsection{#{1:title}}\n#{}',
    preview: '\\subsection{title}',
  },
  {
    label: 'sssec',
    detail: 'subsubsection',
    template: '\\subsubsection{#{1:title}}\n#{}',
    preview: '\\subsubsection{title}',
  },
  {
    label: 'frac',
    detail: 'fraction',
    template: '\\frac{#{1:num}}{#{2:den}}',
    preview: '\\frac{num}{den}',
  },
  {
    label: 'bf',
    detail: 'bold text',
    template: '\\textbf{#{}}',
    preview: '\\textbf{...}',
  },
  {
    label: 'it',
    detail: 'italic text',
    template: '\\textit{#{}}',
    preview: '\\textit{...}',
  },
];
